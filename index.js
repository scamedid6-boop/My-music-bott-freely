const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YoutubeiExtractor } = require('discord-player-youtubei');
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

const player = new Player(client);

const commands = [
    new SlashCommandBuilder().setName('join').setDescription('Joins your voice channel and start playing music'),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play any song from YouTube, Spotify, or SoundCloud')
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

    try {
        await player.extractors.register(YoutubeiExtractor, {});
        await player.extractors.loadMulti(DefaultExtractors);
        console.log('Music engines load ho gaye!');
    } catch (e) {
        console.log('Extractor warning:', e.message);
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Saare slash commands register ho gaye!');
    } catch (error) {
        console.error(error);
    }
});

player.events.on('playerStart', (queue, track) => {
    queue.metadata.channel.send(`🎶 **Ab Baj Raha Hai:** ${track.title} \n⏱️ **Duration:** ${track.duration}`);
});

player.events.on('playerError', (queue, error) => {
    console.log(`Player Error: ${error.message}`);
    queue.metadata.channel.send('⚠️ Is gaane mein thodi dikkat aayi, agla gaana laga raha hoon...');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'join') {
        const channel = interaction.member.voice.channel;
        if (!channel) return interaction.reply({ content: '❌ Bhai, pehle kisi Voice Channel mein join ho jao!', ephemeral: true });

        try {
            const queue = player.nodes.create(interaction.guild, {
                metadata: { channel: interaction.channel },
                selfDeaf: true,
                volume: 80,
                leaveOnEmpty: false,
                leaveOnEnd: false
            });
            if (!queue.connection) await queue.connect(channel);
            return interaction.reply(`✅ **${channel.name}** mein aa gaya hoon! Ab \`/play\` se koi bhi gana bajayein.`);
        } catch (e) {
            return interaction.reply('❌ Voice channel join karne mein dikkat aayi.');
        }
    }

    if (commandName === 'play') {
        const channel = interaction.member.voice.channel;
        if (!channel) return interaction.reply({ content: '❌ Bhai, pehle kisi Voice Channel mein join ho jao!', ephemeral: true });

        await interaction.deferReply();

        const query = interaction.options.getString('song');

        try {
            const { track } = await player.play(channel, query, {
                nodeOptions: {
                    metadata: { channel: interaction.channel },
                    selfDeaf: true,
                    volume: 80,
                    leaveOnEmpty: false,
                    leaveOnEnd: false
                }
            });

            return interaction.editReply(`✅ **Queue mein add ho gaya:** ${track.title}`);
        } catch (e) {
            console.error(e);
            return interaction.editReply('❌ Yeh gana load nahi ho paya, koi doosra naam ya link try karein.');
        }
    }

    if (commandName === 'skip') {
        const queue = player.nodes.get(interaction.guild.id);
        if (!queue || !queue.isPlaying()) return interaction.reply({ content: '❌ Abhi koi gana nahi baj raha hai!', ephemeral: true });
        
        queue.node.skip();
        return interaction.reply('⏭️ Agla gaana laga diya gaya hai!');
    }

    if (commandName === 'stop') {
        const queue = player.nodes.get(interaction.guild.id);
        if (!queue) return interaction.reply({ content: '❌ Main abhi kisi voice channel mein nahi hoon!', ephemeral: true });

        queue.delete();
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
