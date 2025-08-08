
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import QRCode from 'qrcode';
import dayjs from 'dayjs';
import { customAlphabet } from 'nanoid';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

// init schema
db.exec(`
CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'open',
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  ord INTEGER DEFAULT 0,
  FOREIGN KEY(poll_id) REFERENCES polls(id)
);
CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  assigned_to_name TEXT,
  used_at TEXT,
  FOREIGN KEY(poll_id) REFERENCES polls(id)
);
CREATE TABLE IF NOT EXISTS voters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT,
  FOREIGN KEY(poll_id) REFERENCES polls(id)
);
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  option_id INTEGER NOT NULL,
  voter_id INTEGER NOT NULL,
  created_at TEXT,
  FOREIGN KEY(poll_id) REFERENCES polls(id),
  FOREIGN KEY(option_id) REFERENCES options(id),
  FOREIGN KEY(voter_id) REFERENCES voters(id)
);
`);

// helpers
const nanoid = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);
const isAdmin = (req) => (req.query.p === process.env.ADMIN_PASSWORD);

// Home
app.get('/', (req, res) => {
  res.render('index', { baseUrl: process.env.APP_BASE_URL });
});

// Admin: create poll / list polls
app.get('/admin', (req, res) => {
  if (!isAdmin(req)) return res.status(401).send('Unauthorized. Add ?p=ADMIN_PASSWORD');
  const polls = db.prepare('SELECT * FROM polls ORDER BY id DESC').all();
  res.render('admin', { polls });
});

app.post('/admin/create', (req, res) => {
  if (req.body.key !== process.env.ADMIN_PASSWORD) return res.status(401).send('Unauthorized');
  const { title, description, options, token_count } = req.body;
  const now = dayjs().toISOString();
  const info = db.prepare('INSERT INTO polls (title, description, status, created_at) VALUES (?, ?, ?, ?)')
                 .run(title, description || '', 'open', now);
  const pollId = info.lastInsertRowid;

  const opts = (options || '').split('\n').map(s => s.trim()).filter(Boolean);
  const insertOpt = db.prepare('INSERT INTO options (poll_id, label, ord) VALUES (?, ?, ?)');
  let order = 0;
  for (const label of opts) insertOpt.run(pollId, label, order++);

  const count = Math.max(1, parseInt(token_count || '1'));
  const insertTok = db.prepare('INSERT INTO tokens (poll_id, code) VALUES (?, ?)');
  for (let i = 0; i < count; i++) insertTok.run(pollId, nanoid());

  res.redirect(`/admin/poll/${pollId}?p=${process.env.ADMIN_PASSWORD}`);
});

// Admin: view poll
app.get('/admin/poll/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(401).send('Unauthorized');
  const pollId = parseInt(req.params.id);
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
  if (!poll) return res.status(404).send('Poll not found');

  const options = db.prepare('SELECT * FROM options WHERE poll_id = ? ORDER BY ord ASC').all(pollId);
  const tokens = db.prepare('SELECT * FROM tokens WHERE poll_id = ? ORDER BY id ASC').all(pollId);
  const votesCount = db.prepare('SELECT COUNT(*) as c FROM votes WHERE poll_id = ?').get(pollId).c;
  const usedTokens = db.prepare('SELECT COUNT(*) as c FROM tokens WHERE poll_id = ? AND used_at IS NOT NULL').get(pollId).c;

  res.render('poll_admin', { poll, options, tokens, votesCount, usedTokens, baseUrl: process.env.APP_BASE_URL });
});

// Admin: close/open poll
app.post('/admin/poll/:id/status', (req, res) => {
  if (req.body.key !== process.env.ADMIN_PASSWORD) return res.status(401).send('Unauthorized');
  const pollId = parseInt(req.params.id);
  const { status } = req.body;
  db.prepare('UPDATE polls SET status = ? WHERE id = ?').run(status, pollId);
  res.redirect(`/admin/poll/${pollId}?p=${process.env.ADMIN_PASSWORD}`);
});

// QR endpoint (PNG)
app.get('/qr', async (req, res) => {
  const data = req.query.data;
  if (!data) return res.status(400).send('Missing data');
  try {
    const png = await QRCode.toBuffer(data, { errorCorrectionLevel: 'M', margin: 1, width: 300 });
    res.type('png').send(png);
  } catch (e) {
    res.status(500).send('QR error');
  }
});

// Token landing
app.get('/t/:code', (req, res) => {
  const code = req.params.code;
  const token = db.prepare('SELECT * FROM tokens WHERE code = ?').get(code);
  if (!token) return res.status(404).send('Código no válido.');

  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(token.poll_id);
  if (!poll || poll.status !== 'open') {
    return res.render('closed', { poll });
  }

  if (token.used_at) {
    return res.render('already_used', { poll });
  }

  const options = db.prepare('SELECT * FROM options WHERE poll_id = ? ORDER BY ord ASC').all(token.poll_id);
  res.render('vote', { poll, options, code });
});

// Submit vote
app.post('/vote', (req, res) => {
  const { name, option_id, code } = req.body;
  const token = db.prepare('SELECT * FROM tokens WHERE code = ?').get(code);
  if (!token) return res.status(400).send('Token inválido');
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(token.poll_id);
  if (!poll || poll.status !== 'open') return res.status(400).send('Encuesta cerrada');
  if (token.used_at) return res.status(400).send('Este token ya fue usado');

  const now = dayjs().toISOString();
  // create voter
  const voterInfo = db.prepare('INSERT INTO voters (poll_id, name, created_at) VALUES (?, ?, ?)')
                      .run(token.poll_id, (name || '').trim(), now);
  const voterId = voterInfo.lastInsertRowid;
  // create vote
  db.prepare('INSERT INTO votes (poll_id, option_id, voter_id, created_at) VALUES (?, ?, ?, ?)')
    .run(token.poll_id, parseInt(option_id), voterId, now);
  // mark token used
  db.prepare('UPDATE tokens SET used_at = ? WHERE id = ?').run(now, token.id);

  res.redirect(`/thanks/${token.poll_id}`);
});

app.get('/thanks/:pollId', (req, res) => {
  const pollId = parseInt(req.params.pollId);
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
  res.render('thanks', { poll });
});

// Results
app.get('/results/:pollId', (req, res) => {
  const pollId = parseInt(req.params.pollId);
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
  if (!poll) return res.status(404).send('No existe la encuesta');

  const options = db.prepare('SELECT * FROM options WHERE poll_id = ? ORDER BY ord ASC').all(pollId);
  const results = db.prepare(`
    SELECT o.id as option_id, o.label, COUNT(v.id) as votes
    FROM options o
    LEFT JOIN votes v ON v.option_id = o.id
    WHERE o.poll_id = ?
    GROUP BY o.id, o.label
    ORDER BY o.ord ASC
  `).all(pollId);

  const voters = db.prepare(`
    SELECT voters.name, options.label as choice, votes.created_at
    FROM votes
    JOIN voters ON voters.id = votes.voter_id
    JOIN options ON options.id = votes.option_id
    WHERE votes.poll_id = ?
    ORDER BY votes.id ASC
  `).all(pollId);

  res.render('results', { poll, options, results, voters });
});

// Simple CSV export
app.get('/admin/poll/:id/export', (req, res) => {
  if (!isAdmin(req)) return res.status(401).send('Unauthorized');
  const pollId = parseInt(req.params.id);
  const rows = db.prepare(`
    SELECT voters.name, options.label as choice, votes.created_at
    FROM votes
    JOIN voters ON voters.id = votes.voter_id
    JOIN options ON options.id = votes.option_id
    WHERE votes.poll_id = ?
    ORDER BY votes.id ASC
  `).all(pollId);

  const csv = ['name,choice,created_at', *[`${r.name || ''},${r.choice},${r.created_at}` for (r of rows)]];
  res.type('text/csv').send(csv.join('\n'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Class Voting App running on http://localhost:${port}`);
});
