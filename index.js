
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Slash Music Bot Ready Hai! 🎵'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const commands = [
    new SlashCommandBuilder().setName('hello').setDescription('Bot se hello bolein'),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Koi bhi gana bajayein')
        .addStringOption(option => 
            option.setName('query')
                .setDescription('Gaane ka naam ya link')
                .setRequired(true)),
    new SlashCommandBuilder().setName('stop').setDescription('Gana rok kar channel se niklein')
].map(command => command.toJSON());

client.on('ready', async () => {
    console.log(`${client.user.tag} online hai!`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Saare slash commands kamyabi se add ho gaye!');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'hello') {
        await interaction.reply('Ram Ram bhai! Main slash commands ke sath taiyar hoon. 🎧');
    }

    if (commandName === 'play') {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'Bhai, pehle kisi voice channel mein jao! 🎙️', ephemeral: true });
        }
        const songName = interaction.options.getString('query');
        await interaction.reply(`🎶 **${songName}** ko play karne ki koshish kar raha hoon... (Channel: ${voiceChannel.name})`);
    }

    if (commandName === 'stop') {
        await interaction.reply('🛑 Gana rok diya gaya hai.');
    }
});

client.login(process.env.DISCORD_TOKEN);
