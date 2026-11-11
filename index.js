const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection, NoSubscriberBehavior } = require('@discordjs/voice');
const yts = require('yt-search');
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
    new SlashCommandBuilder()
        .setName('join')
        .setDescription('Joins your voice channel and gets ready to play music'),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play any song with high quality audio and glowing embeds')
        .addStringOption(option => 
            option.setName('song')
                .setDescription('Enter song name or artist')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the currently playing song'),
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the music and disconnect from the voice channel'),
    new SlashCommandBuilder()
        .setName('owner')
        .setDescription('View information about the bot creator'),
    new SlashCommandBuilder()
        .setName('hello')
        .setDescription('Check bot status and greet SAKSHAM MUSIC')
].map(command => command.toJSON());

function formatDuration(seconds) {
    const num = Number(seconds);
    if (!num || isNaN(num)) return '03:30';
    const mins = Math.floor(num / 60);
    const secs = Math.floor(num % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function createGlowingEmbed({ title, description, color = '#00F5FF', thumbnail = null, fields = [] }) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setFooter({ text: 'SAKSHAM MUSIC • 24/7 Ultra HD Audio' })
        .setTimestamp();
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (fields.length > 0) embed.addFields(fields);
    return embed;
}

async function fetchUniversalSong(query) {
    let cleanTitle = query;
    let ytLink = null;
    let ytThumb = null;
    let ytDuration = '03:30';

    try {
        const ytRes = await yts(query);
        if (ytRes && Array.isArray(ytRes.videos) && ytRes.videos.length > 0) {
            const vid = ytRes.videos.at(0);
            cleanTitle = vid.title;
            ytLink = vid.url;
            ytThumb = vid.thumbnail;
            ytDuration = vid.timestamp || '03:30';
        }
    } catch (e) {
        console.log('YT metadata fallback');
    }

    // Source 1: Official JioSaavn Direct High-Speed Stream
    try {
        const saavnSearch = await fetch(`https://jiosaavn.com{encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const saavnData = await saavnSearch.json();
        const item = Array.isArray(saavnData?.results) ? saavnData.results.at(0) : null;

        if (item && item.id) {
            const detailRes = await fetch(`https://jiosaavn.com{item.id}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            const detailJson = await detailRes.json();
            const song = Array.isArray(detailJson?.songs) ? detailJson.songs.at(0) : null;

            if (song && song.more_info?.vlink) {
                return {
                    title: (song.title || cleanTitle).replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
                    streamUrl: song.more_info.vlink,
                    pageUrl: ytLink || song.perma_url || 'https://youtube.com',
                    duration: formatDuration(song.more_info.duration) || ytDuration,
                    thumbnail: (song.image ? song.image.replace('150x150', '500x500') : null) || ytThumb || 'https://imgur.com'
                };
            }
        }
    } catch (e) {
        console.log('Switching to Source 2...');
    }

    // Source 2: Official Deezer Global Stream
    try {
        const dzRes = await fetch(`https://deezer.com{encodeURIComponent(query)}&limit=1`);
        const dzJson = await dzRes.json();
        const dzTrack = Array.isArray(dzJson?.data) ? dzJson.data.at(0) : null;

        if (dzTrack && dzTrack.preview) {
            return {
                title: `${dzTrack.title} - ${dzTrack.artist?.name || 'Artist'}`,
                streamUrl: dzTrack.preview,
                pageUrl: ytLink || dzTrack.link || 'https://youtube.com',
                duration: formatDuration(dzTrack.duration) || ytDuration,
                thumbnail: dzTrack.album?.cover_big || ytThumb || 'https://imgur.com'
            };
        }
    } catch (e) {
        console.log('Switching to Source 3...');
    }

    // Source 3: iTunes Global Music Fallback
    try {
        const itunesRes = await fetch(`https://apple.com{encodeURIComponent(query)}&media=music&limit=1`);
        const itunesJson = await itunesRes.json();
        const itTrack = Array.isArray(itunesJson?.results) ? itunesJson.results.at(0) : null;

        if (itTrack && itTrack.previewUrl) {
            return {
                title: `${itTrack.trackName} - ${itTrack.artistName}`,
                streamUrl: itTrack.previewUrl,
                pageUrl: ytLink || itTrack.trackViewUrl || 'https://youtube.com',
                duration: formatDuration(Math.floor((itTrack.trackTimeMillis || 30000) / 1000)),
                thumbnail: (itTrack.artworkUrl100 ? itTrack.artworkUrl100.replace('100x100', '500x500') : null) || ytThumb || 'https://imgur.com'
            };
        }
    } catch (e) {
        console.log('All sources checked.');
    }

    return null;
}

client.on('ready', async () => {
    console.log(`${client.user.tag} is online and 100% operational!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        client.guilds.cache.forEach(async (guild) => {
            await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands });
            console.log(`Commands synced in [${guild.name}]`);
        });
    } catch (error) {
        console.error('Command Sync Error:', error);
    }
});

async function playNextSong(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || serverQueue.songs.length === 0) return;

    const song = serverQueue.songs.at(0);
    try {
        const resource = createAudioResource(song.streamUrl, { inlineVolume: true });
        resource.volume.setVolume(1);

        serverQueue.player.play(resource);

        const nowPlayingEmbed = createGlowingEmbed({
            title: '✨ Now Playing',
            description: `🎶 **[${song.title}](${song.pageUrl})**`,
            color: '#FF007F',
            thumbnail: song.thumbnail,
            fields: [
                { name: '⏱️ Duration', value: `\`${song.duration}\``, inline: true },
                { name: '🎧 Quality', value: '`320kbps HD`', inline: true },
                { name: '👤 Requested By', value: `${song.requester}`, inline: true }
            ]
        });

        serverQueue.textChannel.send({ embeds: [nowPlayingEmbed] });
    } catch (err) {
        console.error('Audio Stream Error:', err);
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
            return interaction.reply({
                embeds: [createGlowingEmbed({
                    title: '⚠️ Voice Channel Required',
                    description: 'Please join a voice channel first so I can connect with you!',
                    color: '#FF3366'
                })],
                ephemeral: true
            });
        }

        joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false
        });

        return interaction.reply({
            embeds: [createGlowingEmbed({
                title: '✅ Connected Successfully',
                description: `Joined **${channel.name}**!\nType \`/play\` followed by any song name to start the party! 🎉`,
                color: '#00FF88'
            })]
        });
    }

    if (commandName === 'play') {
        const channel = interaction.member.voice.channel;
        if (!channel) {
            return interaction.reply({
                embeds: [createGlowingEmbed({
                    title: '⚠️ Voice Channel Required',
                    description: 'Please join a voice channel first before playing music!',
                    color: '#FF3366'
                })],
                ephemeral: true
            });
        }

        await interaction.deferReply();
        const query = interaction.options.getString('song');

        const songData = await fetchUniversalSong(query);
        if (!songData) {
            return interaction.editReply({
                embeds: [createGlowingEmbed({
                    title: '🔍 Song Unavailable',
