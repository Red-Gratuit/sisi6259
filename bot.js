const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ===== CONFIGURATION =====
const BOT_TOKEN = process.env.BOT_TOKEN || '8544428843:AAGYOkRT263AukBCa2ZM6d5MoCJI4nY2_9U';
const ADMIN_IDS = process.env.ADMIN_IDS
    ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim()))
    : [8627182295];

// ===== INITIALISATION =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Fichier pour stocker les utilisateurs abonnés
const subscribersPath = path.join(__dirname, 'subscribers.json');

function loadSubscribers() {
    if (fs.existsSync(subscribersPath)) {
        return JSON.parse(fs.readFileSync(subscribersPath, 'utf8'));
    }
    return [];
}

function saveSubscribers(subs) {
    fs.writeFileSync(subscribersPath, JSON.stringify(subs, null, 2));
}

// Charger les abonnés au démarrage
let subscribers = loadSubscribers();

// ===== COMMANDE /start =====
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'Utilisateur';

    // Ajouter l'utilisateur aux abonnés s'il n'y est pas déjà
    if (!subscribers.find(s => s.chatId === chatId)) {
        subscribers.push({
            chatId,
            firstName,
            username: msg.from.username || null,
            joinedAt: new Date().toISOString()
        });
        saveSubscribers(subscribers);
    }

    bot.sendMessage(chatId,
        `👋 Bienvenue ${firstName} !\n\n` +
        `📸 Bienvenue sur le bot SISI 6259\n` +
        `👻 Snap : @sisi622599\n\n` +
        `Tu recevras les annonces importantes ici.`
    );
});

// ===== COMMANDE /broadcast (admin uniquement) =====
bot.onText(/\/broadcast(?:\s+([\s\S]+))?/, async (msg, match) => {
    const chatId = msg.chat.id;

    // Vérifier si l'utilisateur est admin
    if (!ADMIN_IDS.includes(msg.from.id)) {
        return bot.sendMessage(chatId, '⛔ Tu n\'as pas la permission d\'utiliser cette commande.');
    }

    const text = match[1];

    if (!text) {
        return bot.sendMessage(chatId,
            '📢 *Utilisation de /broadcast :*\n\n' +
            '`/broadcast Ton message ici`\n\n' +
            'Le message sera envoyé à tous les abonnés du bot.',
            { parse_mode: 'Markdown' }
        );
    }

    // Recharger les abonnés pour être à jour
    subscribers = loadSubscribers();

    let sent = 0;
    let failed = 0;

    await bot.sendMessage(chatId, `📤 Envoi en cours à ${subscribers.length} abonné(s)...`);

    for (const sub of subscribers) {
        try {
            await bot.sendMessage(sub.chatId,
                `📢 *Annonce SISI 6259*\n\n${text}`,
                { parse_mode: 'Markdown' }
            );
            sent++;
        } catch (err) {
            failed++;
            // Si l'utilisateur a bloqué le bot, le retirer
            if (err.response && err.response.statusCode === 403) {
                subscribers = subscribers.filter(s => s.chatId !== sub.chatId);
                saveSubscribers(subscribers);
            }
        }
    }

    bot.sendMessage(chatId,
        `✅ Broadcast terminé !\n\n` +
        `📬 Envoyés : ${sent}\n` +
        `❌ Échoués : ${failed}`
    );
});

// ===== COMMANDE /stats (admin uniquement) =====
bot.onText(/\/stats/, (msg) => {
    const chatId = msg.chat.id;

    if (!ADMIN_IDS.includes(msg.from.id)) {
        return bot.sendMessage(chatId, '⛔ Commande réservée aux admins.');
    }

    subscribers = loadSubscribers();

    bot.sendMessage(chatId,
        `📊 *Statistiques du bot*\n\n` +
        `👥 Abonnés : ${subscribers.length}\n` +
        `🤖 Bot actif : ✅`,
        { parse_mode: 'Markdown' }
    );
});

// ===== DÉMARRAGE =====
console.log('\n🤖 Bot SISI 6259 démarré !');
console.log('📢 Commandes disponibles :');
console.log('   /start     - Inscription au bot');
console.log('   /broadcast - Envoyer un message à tous (admin)');
console.log('   /stats     - Voir les statistiques (admin)\n');
