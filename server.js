const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3100;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'traty.db');
const SECRET_PATH = path.join(DATA_DIR, 'jwt.secret');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 1. Persistent Secret Key
let JWT_SECRET;
if (fs.existsSync(SECRET_PATH)) {
  JWT_SECRET = fs.readFileSync(SECRET_PATH, 'utf8').trim();
} else {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_PATH, JWT_SECRET, 'utf8');
}

// 2. Database Initialization
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_login_at TEXT,
    login_count INTEGER DEFAULT 0,
    last_ip TEXT
  );

  CREATE TABLE IF NOT EXISTS user_data (
    user_id TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS visitor_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    user_agent TEXT,
    path TEXT,
    status TEXT,
    user_email TEXT,
    created_at TEXT NOT NULL
  );
`);

// 3. Helper Functions: Passwords & Tokens
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  // Token expires in 5 years for permanent seamless PWA usage
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + (5 * 365 * 24 * 3600) })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// 4. Rate-limiting for Brute-force protection
const failedAttempts = new Map(); // ip -> { count, lockedUntil }

function checkRateLimit(ip) {
  const record = failedAttempts.get(ip);
  if (!record) return { allowed: true };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const minutesLeft = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return { allowed: false, error: `Слишком много неверных попыток. Доступ заблокирован на ${minutesLeft} мин.` };
  }
  return { allowed: true };
}

function recordFailedAttempt(ip) {
  const record = failedAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= 5) {
    record.lockedUntil = Date.now() + (15 * 60 * 1000); // 15 minutes lockout
  }
  failedAttempts.set(ip, record);
}

function clearRateLimit(ip) {
  failedAttempts.delete(ip);
}

// 5. Express App Setup
const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Visitor tracking middleware
app.use((req, res, next) => {
  const clientIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress;
  req.clientIp = clientIp;

  // Log only page visits and auth/data requests, ignore assets
  if (!req.path.match(/\.(css|js|png|jpg|svg|ico|json|woff2?|map)$/i)) {
    try {
      db.prepare(`
        INSERT INTO visitor_logs (ip, user_agent, path, status, user_email, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        clientIp || 'unknown',
        (req.headers['user-agent'] || '').slice(0, 250),
        req.path,
        'visit',
        '',
        new Date().toISOString()
      );
    } catch (err) {
      console.error('Visitor log error:', err.message);
    }
  }
  next();
});

// Auth Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload || !payload.userId) {
    return res.status(401).json({ error: 'Недействительный или просроченный токен' });
  }
  const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(payload.userId);
  if (!user) {
    return res.status(401).json({ error: 'Пользователь не найден' });
  }
  req.user = user;
  next();
}

// ================= API ENDPOINTS =================

// Check Email
app.post('/api/auth/check-email', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Укажите корректный email' });
  }
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  return res.json({ exists: !!user });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const ip = req.clientIp;

  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: rateCheck.error });
  }

  if (!email || !password) {
    return res.status(400).json({ error: 'Введите email и пароль' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const hash = hashPassword(password, user.salt);
  if (hash !== user.password_hash) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  clearRateLimit(ip);

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users SET last_login_at = ?, login_count = login_count + 1, last_ip = ? WHERE id = ?
  `).run(now, ip, user.id);

  const token = createToken({ userId: user.id, email: user.email });
  return res.json({
    success: true,
    token,
    user: { id: user.id, email: user.email, created_at: user.created_at }
  });
});

// Register
app.post('/api/auth/register', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const ip = req.clientIp;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Укажите корректный email' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
  }

  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, email, password_hash, salt, created_at, last_login_at, login_count, last_ip)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, email, passwordHash, salt, now, now, ip);

  // Initialize empty data container
  db.prepare(`
    INSERT INTO user_data (user_id, data_json, updated_at)
    VALUES (?, '{}', ?)
  `).run(id, now);

  const token = createToken({ userId: id, email });
  return res.json({
    success: true,
    token,
    user: { id, email, created_at: now }
  });
});

// Current User
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Get User Data
app.get('/api/data', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT data_json, updated_at FROM user_data WHERE user_id = ?').get(req.user.id);
  let parsed = {};
  if (row && row.data_json) {
    try { parsed = JSON.parse(row.data_json); } catch {}
  }
  res.json({
    data: parsed,
    updatedAt: row ? row.updated_at : null
  });
});

// Save User Data
app.post('/api/data', authMiddleware, (req, res) => {
  const data = req.body?.data;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Некорректный формат данных' });
  }
  const now = new Date().toISOString();
  const jsonStr = JSON.stringify(data);

  db.prepare(`
    INSERT INTO user_data (user_id, data_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
  `).run(req.user.id, jsonStr, now);

  res.json({ success: true, updatedAt: now });
});

// Stats (User Tracking)
app.get('/api/stats', (req, res) => {
  const totalUsersRow = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const users = db.prepare(`
    SELECT id, email, created_at, last_login_at, login_count FROM users ORDER BY created_at DESC
  `).all();
  const totalVisitsRow = db.prepare('SELECT COUNT(*) as count FROM visitor_logs').get();
  const recentVisits = db.prepare(`
    SELECT ip, user_agent, path, created_at FROM visitor_logs ORDER BY id DESC LIMIT 20
  `).all();

  res.json({
    totalUsers: totalUsersRow.count,
    users,
    totalVisits: totalVisitsRow.count,
    recentVisits
  });
});

// Static Assets
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    if (filePath.endsWith('manifest.json')) {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Fallback to index.html for SPA/PWA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Траты PWA сервер запущен на http://127.0.0.1:${PORT}`);
});
