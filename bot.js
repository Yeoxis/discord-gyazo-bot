const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Bot configuration
const config = {
    token: process.env.DISCORD_TOKEN || 'YOUR_DISCORD_BOT_TOKEN',
    gyazoToken: process.env.GYAZO_TOKEN || 'YOUR_GYAZO_ACCESS_TOKEN',
    channelId: process.env.CHANNEL_ID || '' // Optional: specify a channel, or leave empty for all channels
};

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Function to download image
async function downloadImage(url, filename) {
    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(filename);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// Function to upload image to Gyazo
async function uploadToGyazo(imagePath) {
    try {
        const form = new FormData();
        form.append('access_token', config.gyazoToken);
        form.append('imagedata', fs.createReadStream(imagePath));
        
        const response = await axios.post('https://upload.gyazo.com/api/upload', form, {
            headers: {
                ...form.getHeaders(),
            },
        });
        
        return response.data;
    } catch (error) {
        console.error('Error uploading to Gyazo:', error.response?.data || error.message);
        throw error;
    }
}

// Function to get direct image URL from Gyazo response
function getDirectImageUrl(gyazoResponse) {
    // Gyazo direct image URL format: https://i.gyazo.com/{image_id}.{extension}
    const imageId = gyazoResponse.image_id;
    const url = gyazoResponse.url;
    
    // Extract extension from the original URL or default to jpg
    const extension = url.split('.').pop() || 'jpg';
    
    return `https://i.gyazo.com/${imageId}.${extension}`;
}

// Function to clean up temporary files
function cleanupFile(filepath) {
    try {
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
    } catch (error) {
        console.error('Error cleaning up file:', error);
    }
}

// Bot ready event
client.once('ready', () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
    console.log(`Monitoring ${config.channelId ? 'specific channel' : 'all channels'} for images...`);
});

// Message event handler
client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Check if we should monitor this channel
    if (config.channelId && message.channel.id !== config.channelId) return;
    
    // Check if message has attachments
    if (message.attachments.size === 0) return;
    
    // Process each attachment
    for (const attachment of message.attachments.values()) {
        // Check if attachment is an image
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        const isImage = imageExtensions.some(ext => 
            attachment.name.toLowerCase().endsWith(ext)
        );
        
        if (!isImage) continue;
        
        try {
            // Send initial processing message
            const processingMsg = await message.reply('🔄 Uploading image to Gyazo...');
            
            // Create temp directory if it doesn't exist
            const tempDir = './temp';
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
            }
            
            // Download the image
            const tempFilename = path.join(tempDir, `temp_${Date.now()}_${attachment.name}`);
            await downloadImage(attachment.url, tempFilename);
            
            // Upload to Gyazo
            const gyazoResponse = await uploadToGyazo(tempFilename);
            
            // Get direct image URL
            const directUrl = getDirectImageUrl(gyazoResponse);
            
            // Edit the processing message with the result
            await processingMsg.edit(`\`\`\`${directUrl}\`\`\``);
            
            // Clean up temp file
            cleanupFile(tempFilename);
            
        } catch (error) {
            console.error('Error processing image:', error);
            await message.reply('❌ Failed to upload image to Gyazo. Please try again later.');
        }
    }
});

// Error handling
client.on('error', (error) => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

// Start the bot
client.login(config.token).catch(console.error);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down bot...');
    client.destroy();
    process.exit(0);
});
