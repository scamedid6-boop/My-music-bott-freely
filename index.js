const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection, NoSubscriberBehavior } = require('@discordjs/voice');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('SAKSHAM MUSIC 24/7 Live! 🎵'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const queues = new Map();

const commands = [
    new SlashCommandBuilder().setName('join').setDescription('Joins your voice channel and start playing music'),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play any song without any error')
        .addStringOption(option => 
            option.setName('song')
                .setDescription('Enter song name')
                .setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Skip to the next song in the queue'),
    new SlashCommandBuilder().setName('stop').setDescription('Stop the music and leave the voice channel'),
    new SlashCommandBuilder().setName('owner').setDescription('Check the name of the bot owner'),
    new SlashCommandBuilder().setName('hello').setDescription('Say hello to the bot')
].map(command => command.toJSON());

function createEmbed(title, description, color = '#00FF88', thumbnail = null) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setFooter({ text: 'SAKSHAM MUSIC • 24/7 Live' })
        .setTimestamp();
    if (thumbnail) embed.setThumbnail(thumbnail);
    return embed;
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

async function searchSong(query) {
    try {
        // 1. Official JioSaavn Direct Search API
        const saavnUrl = `https://jiosaavn.com{encodeURIComponent(query)}`;
        const res = await fetch(saavnUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const data = await res.json();
        const track = data?.results?.[0];

        if (track && track.id) {
            const detailUrl = `https://jiosaavn.com{track.id}`;
            const detailRes = await fetch(detailUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const detailData = await detailRes.json();
            const songObj = detailData?.songs?.[0];

            if (songObj && songObj.more_info?.vlink) {
                return {
                    title: (songObj.title || query).replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
                    url: songObj.more_info.vlink,
                    pageUrl: songObj.perma_url || 'https://jiosaavn.com',
                    duration: formatDuration(Number(songObj.more_info.duration) || 0),
                    thumbnail: songObj.image ? songObj.image.replace('150x150', '500x500') : null
                };
            }
        }
    } catch (e) {
        console.log('Saavn fallback to Deezer...');
    }

    try {
        // 2. Official Deezer Direct API (Global Songs Backup)
        const deezerRes = await fetch(`https://deezer.com{encodeURIComponent(query)}&limit=1`);
        const deezerData = await deezerRes.json();
        const dTrack = deezerData?.data?.[0];

        if (dTrack && dTrack.preview) {
            return {
                title: `${dTrack.title} - ${dTrack.artist?.name || ''}`,
                url: dTrack.preview,
                pageUrl: dTrack.link || 'https://deezer.com',
                duration: formatDuration(Number(dTrack.duration) || 30),
                thumbnail: dTrack.album?.cover_big || dTrack.album?.cover_medium || null
            };
        }
    } catch (e) {
        console.log('Deezer search error:', e.message);
    }

    return null;
}

client.on('ready', async () => {
    console.log(`${client.user.tag} is online and ready!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        client.guilds.cache.forEach(async (guild) => {
            await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands });
            console.log(`Slash commands registered in [${guild.name}]`);
        });
    } catch (error) {
        console.error('Command Error:', error);
    }
});

async function playNextSong(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || serverQueue.songs.length === 0) return;

    const song = serverQueue.songs.at(0);
    try {
        const resource = createAudioResource(song.url, { inlineVolume: true });
        resource.volume.setVolume(1);

        serverQueue.player.play(resource);

        const embed = createEmbed(
            '🎶 Now Playing',
            `**[${song.title}](${song.pageUrl})**\n⏱️ **Duration:** ${song.duration}`,
            '#FF007F',
            song.thumbnail
        );
        serverQueue.textChannel.send({ embeds: [embed] });
    } catch (err) {
        console.error('Stream Error:', err);
        const errEmbed = createEmbed('⚠️ Playback Error', `Unable to play **${song.title}**, skipping to the next track...`, '#FF4444');
        serverQueue.textChannel.send({ embeds: [errEmbed] });
        serverQueue.songs.shift();
        playNextSong(guildId);
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, guild } = interaction;

    if (commandName === 'join') {
        const channel = interaction.member.voice.channel;
        if (!channel) {
            return interaction.reply({ embeds: [createEmbed('❌ Error', 'Please join a voice channel first!', '#FF4444')], ephemeral: true });
        }

        joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false
        });

        return interaction.reply({ embeds: [createEmbed('✅ Connected', `Joined **${channel.name}**! Use \`/play\` to start playing music.`, '#00FF88')] });
    }

    if (commandName === 'play') {
        const channel = interaction.member.voice.channel;
        if (!channel) {
            return interaction.reply({ embeds: [createEmbed('❌ Error', 'Please join a voice channel first!', '#FF4444')], ephemeral: true });
        }

        await interaction.deferReply();
        const query = interaction.options.getString('song');

        try {
            const songInfo = await searchSong(query);
            if (!songInfo) {
                return interaction.editReply({ embeds: [createEmbed('❌ Not Found', 'No results found for this song. Please try another name.', '#FF4444')] });
            }

            let serverQueue = queues.get(guild.id);

            if (!serverQueue) {
                const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
                const connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
                    selfDeaf: false
                });

                connection.subscribe(player);

                serverQueue = {
                    textChannel: interaction.channel,
                    voiceChannel: channel,
                    connection: connection,
                    player: player,
                    songs: []
                };

                queues.set(guild.id, serverQueue);
                serverQueue.songs.push(songInfo);

                player.on(AudioPlayerStatus.Idle, () => {
                    serverQueue.songs.shift();
                    playNextSong(guild.id);
                });

                player.on('error', error => {
                    console.error('Player Error:', error);
                    serverQueue.songs.shift();
                    playNextSong(guild.id);
                });

                await interaction.editReply({ embeds: [createEmbed('🎧 Starting Music', `**[${songInfo.title}](${songInfo.pageUrl})**`, '#00BFFF', songInfo.thumbnail)] });
                playNextSong(guild.id);
            } else {
                serverQueue.songs.push(songInfo);
                return interaction.editReply({ embeds: [createEmbed('✅ Added to Queue', `**[${songInfo.title}](${songInfo.pageUrl})**\n⏱️ **Duration:** ${songInfo.duration}`, '#00FF88', songInfo.thumbnail)] });
            }
        } catch (error) {
            console.error(error);
            return interaction.editReply({ embeds: [createEmbed('❌ Search Error', 'Failed to load the song. Please try again.', '#FF4444')] });
        }
    }

    if (commandName === 'skip') {
        const serverQueue = queues.get(guild.id);
        if (!serverQueue || serverQueue.songs.length === 0) {
            return interaction.reply({ embeds: [createEmbed('❌ Error', 'There is no song currently playing!', '#FF4444')], ephemeral: true });
        }
        serverQueue.player.stop();
        return interaction.reply({ embeds: [createEmbed('⏭️ Skipped', 'Skipped to the next song in the queue!', '#FFA500')] });
    }

    if (commandName === 'stop') {
        const connection = getVoiceConnection(guild.id);
        if (!connection) {
