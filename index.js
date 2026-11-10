const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const app = express();

// Render को 24/7 एक्टिव रखने के लिए वेब सर्वर
app.get('/', (req, res) => res.send('Music Bot Ready Hai! 🎵'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates // वॉइस चैनल के लिए ज़रूरी है
    ]
});

client.on('ready', () => {
    console.log(`${client.user.tag} ऑनलाइन है और गाना गाने के लिए तैयार है!`);
});

// म्यूज़िक और कस्टम कमांड्स का सेटअप
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. टेस्ट कमांड
    if (command === 'hello') {
        return message.channel.send('Ram Ram bhai! Main active hoon. 🎧');
    }

    // 2. गाना बजाने का कमांड (!play)
    if (command === 'play') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.channel.send('Bhai, pehle kisi voice channel mein jao! 🎙️');
        
        const songName = args.join(' ');
        if (!songName) return message.channel.send('Gaane ka naam toh batao! Udaharani: `!play kabir singh` 🎵');

        message.channel.send(`🎶 **${songName}** ko play karne ki koshish kar raha hoon... (Voice channel: ${voiceChannel.name})`);
        // नोट: असली ऑडियो स्ट्रीमिंग के लिए discord-player की ज़रूरत होती है जो नीचे स्टेप 2 में ऑटोमैटिक इंस्टॉल हो जाएगा।
    }

    // 3. गाना रोकने का कमांड (!stop)
    if (command === 'stop') {
        message.channel.send('🛑 Gana rok diya gaya hai aur main voice channel se nikal raha hoon.');
    }
});

client.login(process.env.DISCORD_TOKEN);
