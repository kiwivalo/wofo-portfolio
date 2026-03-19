const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const VIEWS_FILE = path.join(DATA_DIR, 'views.json');
const RATE_LIMIT_FILE = path.join(DATA_DIR, 'ratelimit.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ADMIN_PASSWORD_HASH = crypto.createHash('sha256').update('201269776557').digest('hex');

const defaults = {
  username: 'Wofo',
  displayName: 'Wofo',
  bio: 'i like games or i like certain artists',
  theme: 'light',
  profileImage: '/images/profile.png',
  youtubeUrl: '',
  instagramUrl: '',
  githubUrl: '',
  spotifyPlaylistUrl: '',
  spotifyProfileUrl: '',
  steamUrl: '',
  tiktokUrl: '',
  musicUrl: '/music/downtown-baby-2.mp3',
  backgroundEffect: 'particles',
  animationsEnabled: 'true',
  customCss: '',
  footerName: 'Wofo',
  accentColor: '#e63946',
  fontFamily: 'Inter',
  profileShape: 'circle',
  linkStyle: 'card',
  showMusicPlayer: 'true',
  showViews: 'false',
  cursorGlow: 'false',
  glitchEffect: 'false',
  greetingText: '',
  customTitle: 'Wofo'
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    }
  } catch (e) {}
  return { ...defaults };
}

function saveSettings(data) {
  const current = loadSettings();
  const updated = { ...current, ...data };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
  return updated;
}

function loadViews() {
  try {
    if (fs.existsSync(VIEWS_FILE)) return JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8'));
  } catch (e) {}
  return { count: 0, ips: [], lastReset: Date.now() };
}

function saveViews(data) {
  fs.writeFileSync(VIEWS_FILE, JSON.stringify(data, null, 2));
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         'unknown';
}

function checkRateLimit(ip, limit = 100, windowMs = 60000) {
  let data = {};
  try {
    if (fs.existsSync(RATE_LIMIT_FILE)) data = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf8'));
  } catch (e) {}

  const now = Date.now();
  if (!data[ip]) data[ip] = { count: 0, reset: now + windowMs };
  if (now > data[ip].reset) data[ip] = { count: 0, reset: now + windowMs };
  data[ip].count++;
  fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(data));
  return data[ip].count <= limit;
}

function validatePassword(input) {
  return crypto.createHash('sha256').update(input).digest('hex') === ADMIN_PASSWORD_HASH;
}

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim().slice(0, 100);
}

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const ip = getClientIP(req);
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
});

app.get('/api/settings', (req, res) => {
  const settings = loadSettings();
  const safeSettings = { ...settings };
  delete safeSettings.customCss;
  res.json(safeSettings);
});

app.get('/api/stats', (req, res) => {
  const views = loadViews();
  res.json({
    viewCount: views.count
  });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/admin/stats', (req, res) => {
  const { password } = req.query;
  if (!validatePassword(password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const views = loadViews();
  res.json({
    totalViews: views.count,
    settings: loadSettings()
  });
});

app.post('/api/settings/bulk', (req, res) => {
  const { password, settings } = req.body;
  if (!validatePassword(password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  if (typeof settings !== 'object' || Array.isArray(settings)) {
    return res.status(400).json({ error: 'Invalid settings format' });
  }
  const safeSettings = {};
  for (const [key, value] of Object.entries(settings)) {
    if (/^[a-zA-Z0-9_]+$/.test(key)) {
      safeSettings[key] = typeof value === 'string' ? sanitize(value) : value;
    }
  }
  saveSettings(safeSettings);
  res.json({ success: true });
});

app.get('*', (req, res) => {
  const ip = getClientIP(req);
  const views = loadViews();
  const settings = loadSettings();
  
  if (settings.showViews === 'true') {
    const oneHour = 60 * 60 * 1000;
    if (Date.now() - views.lastReset > oneHour) {
      views.ips = [];
      views.lastReset = Date.now();
    }
    
    if (!views.ips.includes(ip)) {
      views.ips.push(ip);
      views.count++;
      saveViews(views);
    }
  }
  
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Wofo site running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
