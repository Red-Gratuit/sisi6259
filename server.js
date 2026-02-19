const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-key-in-production';

// Configuration
app.use(express.json());
app.use(express.static(__dirname));

// Storage setup
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);
        if (ext && mime) {
            cb(null, true);
        } else {
            cb(new Error('Type de fichier non autorisé'));
        }
    }
});

// Database (JSON file)
const dbPath = path.join(__dirname, 'database.json');
let database = { media: [], users: [] };

function loadDatabase() {
    if (fs.existsSync(dbPath)) {
        const data = fs.readFileSync(dbPath, 'utf8');
        database = JSON.parse(data);
    } else {
        // Créer un utilisateur admin par défaut
        database.users = [{
            username: 'admin',
            password: 'admin123' // CHANGE THIS IN PRODUCTION
        }];
        saveDatabase();
    }
}

function saveDatabase() {
    fs.writeFileSync(dbPath, JSON.stringify(database, null, 2));
}

loadDatabase();

// Middleware d'authentification
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token invalide' });
        }
        req.user = user;
        next();
    });
}

// ROUTES PUBLIQUES

// Page principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Servir le logo (PNG ou JPG)
app.get('/logo.png', (req, res) => {
    const logoPng = path.join(__dirname, 'public', 'logo.png');
    const logoJpg = path.join(__dirname, 'public', 'logo.jpg');

    if (fs.existsSync(logoPng)) {
        res.sendFile(logoPng);
    } else if (fs.existsSync(logoJpg)) {
        res.sendFile(logoJpg);
    } else {
        res.status(404).send('Logo not found');
    }
});

app.get('/logo.jpg', (req, res) => {
    const logoJpg = path.join(__dirname, 'public', 'logo.jpg');
    const logoPng = path.join(__dirname, 'public', 'logo.png');

    if (fs.existsSync(logoJpg)) {
        res.sendFile(logoJpg);
    } else if (fs.existsSync(logoPng)) {
        res.sendFile(logoPng);
    } else {
        res.status(404).send('Logo not found');
    }
});

// Get all media (public)
app.get('/api/media', (req, res) => {
    const mediaWithUrls = database.media.map(item => ({
        ...item,
        url: `/uploads/${item.filename}`
    }));
    res.json(mediaWithUrls);
});

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// ROUTES ADMIN (protégées)

// Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;

    const user = database.users.find(u => u.username === username && u.password === password);

    if (user) {
        const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, message: 'Connexion réussie' });
    } else {
        res.status(401).json({ error: 'Identifiants incorrects' });
    }
});

// Upload media (protected)
app.post('/api/admin/upload', authenticateToken, upload.single('file'), (req, res) => {
    try {
        const { name, category, description } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Fichier manquant' });
        }

        const mediaType = file.mimetype.startsWith('video') ? 'video' : 'image';

        const newMedia = {
            id: Date.now().toString(),
            name,
            category,
            description: description || '',
            filename: file.filename,
            type: mediaType,
            createdAt: new Date().toISOString()
        };

        database.media.unshift(newMedia);
        saveDatabase();

        res.json({ 
            success: true, 
            message: 'Média ajouté',
            media: { ...newMedia, url: `/uploads/${file.filename}` }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Erreur lors de l\'upload' });
    }
});

// Delete media (protected)
app.delete('/api/admin/media/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const mediaIndex = database.media.findIndex(m => m.id === id);

        if (mediaIndex === -1) {
            return res.status(404).json({ error: 'Média non trouvé' });
        }

        const media = database.media[mediaIndex];
        const filePath = path.join(uploadsDir, media.filename);

        // Supprimer le fichier
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Supprimer de la base de données
        database.media.splice(mediaIndex, 1);
        saveDatabase();

        res.json({ success: true, message: 'Média supprimé' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        app: 'SISI 6259 Galerie',
        mediaCount: database.media.length
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n🚀 SERVEUR SISI 6259 LANCÉ!');
    console.log(`📱 Galerie: http://localhost:${PORT}`);
    console.log('🔐 Login: admin / sisi6259');
    console.log('⚠️  N\'oublie pas de changer le mot de passe!\n');
});
