const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bot Zeabur par active hai! 🎵');
});
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('ready', () => {
    console.log(`${client.user.tag} chal raha hai!`);
});

client.on('messageCreate', message => {
    if (message.author.bot) return;
    if (message.content === '!hello') {
        message.channel.send('Ram Ram! Yeh bot bina kisi restriction ke 24/7 chal raha hai. 🎧');
    }
});

client.login(process.env.DISCORD_TOKEN);
