const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');
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
const GUILD_ID = '1562043430203428866';

const commands = [
    new SlashCommandBuilder().setName('join').setDescription('Joins your voice channel and start playing music'),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play any song from YouTube or SoundCloud')
        .addStringOption(option => 
            option.setName('song')
                .setDescription('Enter song name or link')
                .setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Skip to the next song in the queue'),
    new SlashCommandBuilder().setName('stop').setDescription('Stop the music and leave the voice channel'),
    new SlashCommandBuilder().setName('owner').setDescription('Check the name of the bot owner'),
    new SlashCommandBuilder().setName('hello').setDescription('Say hello to the bot')
].map(command => command.toJSON());

client.on('ready', async () => {
    console.log(`${client.user.tag} taiyar hai!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
        console.log('Saare slash commands 1 second mein server par add ho gaye!');
    } catch (error) {
        console.error(error);
    }
});

async function playNextSong(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || serverQueue.songs.length === 0) {
        return;
    }

    const song = serverQueue.songs[0];
    try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        serverQueue.player.play(resource);
        serverQueue.textChannel.send(`🎶 **Ab Baj Raha Hai:** ${song.title}`);
    } catch (err) {
        console.error('Stream Error:', err);
        serverQueue.textChannel.send(`⚠️ **${song.title}** bajane mein dikkat aayi, agla gaana laga raha hoon...`);
        serverQueue.songs.shift();
        playNextSong(guildId);
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, guild } = interaction;

    if (commandName === 'join') {
        const channel = interaction.member.voice.channel;
        if (!channel) return interaction.reply({ content: '❌ Bhai, pehle kisi Voice Channel mein join ho jao!', ephemeral: true });

        joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        });

        return interaction.reply(`✅ **${channel.name}** mein aa gaya hoon! Ab \`/play\` se koi bhi gana bajayein.`);
    }

    if (commandName === 'play') {
        const channel = interaction.member.voice.channel;
        if (!channel) return interaction.reply({ content: '❌ Bhai, pehle kisi Voice Channel mein join ho jao!', ephemeral: true });

        await interaction.deferReply();
        const query = interaction.options.getString('song');

        try {
            let songInfo;
            if (play.yt_validate(query) === 'video') {
                const info = await play.video_info(query);
                songInfo = { title: info.video_details.title, url: info.video_details.url };
            } else {
                const searchResults = await play.search(query, { limit: 1 });
                if (!searchResults || searchResults.length === 0) {
                    return interaction.editReply('❌ Yeh gaana nahi mila bhai, koi doosra naam try karo.');
                }
                songInfo = { title: searchResults[0].title, url: searchResults[0].url };
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

                await interaction.editReply(`✅ **Start kar raha hoon:** ${songInfo.title}`);
                playNextSong(guild.id);
            } else {
                serverQueue.songs.push(songInfo);
                return interaction.editReply(`✅ **Queue mein add ho gaya:** ${songInfo.title}`);
            }
        } catch (error) {
            console.error(error);
            return interaction.editReply('❌ Gaana search karne mein thodi dikkat aayi, dubara try karein.');
        }
    }

    if (commandName === 'skip') {
        const serverQueue = queues.get(guild.id);
        if (!serverQueue || serverQueue.songs.length === 0) {
            return interaction.reply({ content: '❌ Abhi koi gana nahi baj raha hai!', ephemeral: true });
        }
        serverQueue.player.stop();
        return interaction.reply('⏭️ Agla gaana laga diya gaya hai!');
    }

    if (commandName === 'stop') {
        const connection = getVoiceConnection(guild.id);
        if (!connection) return interaction.reply({ content: '❌ Main abhi kisi voice channel mein nahi hoon!', ephemeral: true });

        queues.delete(guild.id);
        connection.destroy();
        return interaction.reply('🛑 Gaana rok diya gaya hai aur main channel se nikal gaya hoon.');
    }

    if (commandName === 'owner') {
        return interaction.reply('👑 Mera malik aur mujhe banane wale **Saksham Bhai** hain!');
    }

    if (commandName === 'hello') {
        return interaction.reply('Ram Ram bhai! Main 24/7 non-stop music bot hoon. 🎧');
    }
});

client.login(process.env.DISCORD_TOKEN);
