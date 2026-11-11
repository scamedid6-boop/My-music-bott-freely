const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection, NoSubscriberBehavior } = require('@discordjs/voice');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
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
                .setDescription('Enter song name or YouTube link')
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

client.on('ready', async () => {
    console.log(`${client.user.tag} taiyar hai!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        client.guilds.cache.forEach(async (guild) => {
            await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands });
            console.log(`Server [${guild.name}] mein commands add ho gaye!`);
        });
    } catch (error) {
        console.error('Command Error:', error);
    }
});

async function playNextSong(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || serverQueue.songs.length === 0) return;

    const song = serverQueue.songs[0];
    try {
        const stream = ytdl(song.url, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        });

        const resource = createAudioResource(stream);
        serverQueue.player.play(resource);

        const embed = createEmbed(
            '🎶 Now Playing',
            `**[${song.title}](${song.url})**\n⏱️ **Duration:** ${song.duration}`,
            '#FF007F',
            song.thumbnail
        );
        serverQueue.textChannel.send({ embeds: [embed] });
    } catch (err) {
        console.error('Stream Error:', err);
        const errEmbed = createEmbed('⚠️ Playback Error', `**${song.title}** bajane mein dikkat aayi, agla gaana laga raha hoon...`, '#FF4444');
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
            return interaction.reply({ embeds: [createEmbed('❌ Error', 'Bhai, pehle kisi Voice Channel mein join ho jao!', '#FF4444')], ephemeral: true });
        }

        joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        });

        return interaction.reply({ embeds: [createEmbed('✅ Connected', `**${channel.name}** mein aa gaya hoon! Ab \`/play\` se koi bhi gana bajayein.`, '#00FF88')] });
    }

    if (commandName === 'play') {
        const channel = interaction.member.voice.channel;
        if (!channel) {
            return interaction.reply({ embeds: [createEmbed('❌ Error', 'Bhai, pehle kisi Voice Channel mein join ho jao!', '#FF4444')], ephemeral: true });
        }

        await interaction.deferReply();
        const query = interaction.options.getString('song');

        try {
            let songInfo;
            if (ytdl.validateURL(query)) {
                const info = await ytdl.getBasicInfo(query);
                songInfo = {
                    title: info.videoDetails.title,
                    url: info.videoDetails.video_url,
                    duration: info.videoDetails.lengthSeconds + 's',
                    thumbnail: info.videoDetails.thumbnails[0]?.url || null
                };
            } else {
                const searchResults = await yts(query);
                if (!searchResults || !searchResults.videos || searchResults.videos.length === 0) {
                    return interaction.editReply({ embeds: [createEmbed('❌ Not Found', 'Yeh gaana nahi mila bhai, koi doosra naam try karo.', '#FF4444')] });
                }
                const video = searchResults.videos[0];
                songInfo = {
                    title: video.title,
                    url: video.url,
                    duration: video.timestamp,
                    thumbnail: video.thumbnail
                };
            }

            let serverQueue = queues.get(guild.id);

            if (!serverQueue) {
                const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
                const connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
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

                await interaction.editReply({ embeds: [createEmbed('🎧 Starting Music', `**[${songInfo.title}](${songInfo.url})**`, '#00BFFF', songInfo.thumbnail)] });
                playNextSong(guild.id);
            } else {
                serverQueue.songs.push(songInfo);
                return interaction.editReply({ embeds: [createEmbed('✅ Added to Queue', `**[${songInfo.title}](${songInfo.url})**\n⏱️ **Duration:** ${songInfo.duration}`, '#00FF88', songInfo.thumbnail)] });
            }
        } catch (error) {
            console.error(error);
            return interaction.editReply({ embeds: [createEmbed('❌ Search Error', 'Gaana load karne mein dikkat aayi, dubara try karein.', '#FF4444')] });
        }
    }

    if (commandName === 'skip') {
        const serverQueue = queues.get(guild.id);
        if (!serverQueue || serverQueue.songs.length === 0) {
            return interaction.reply({ embeds: [createEmbed('❌ Error', 'Abhi koi gana nahi baj raha hai!', '#FF4444')], ephemeral: true });
        }
        serverQueue.player.stop();
        return interaction.reply({ embeds: [createEmbed('⏭️ Skipped', 'Agla gaana laga diya gaya hai!', '#FFA500')] });
    }

    if (commandName === 'stop') {
        const connection = getVoiceConnection(guild.id);
        if (!connection) {
            return interaction.reply({ embeds: [createEmbed('❌ Error', 'Main abhi kisi voice channel mein nahi hoon!', '#FF4444')], ephemeral: true });
        }
        queues.delete(guild.id);
        connection.destroy();
        return interaction.reply({ embeds: [createEmbed('🛑 Stopped', 'Gaana rok diya gaya hai aur main channel se nikal gaya hoon.', '#FF4444')] });
    }

    if (commandName === 'owner') {
        return interaction.reply({ embeds: [createEmbed('👑 Bot Owner', 'Mera malik aur mujhe banane wale **Saksham Bhai** hain!', '#FFD700')] });
    }

    if (commandName === 'hello') {
        return interaction.reply({ embeds: [createEmbed('👋 Ram Ram Bhai!', 'Main **SAKSHAM MUSIC** hoon — 24/7 non-stop music bot! 🎧', '#00FF88')] });
    }
});

client.login(process.env.DISCORD_TOKEN);
