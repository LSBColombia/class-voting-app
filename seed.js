
import Database from 'better-sqlite3';
import dayjs from 'dayjs';
import { customAlphabet } from 'nanoid';

const db = new Database('./data.db');
db.pragma('journal_mode = WAL');

db.exec(`DELETE FROM polls; DELETE FROM options; DELETE FROM tokens; DELETE FROM voters; DELETE FROM votes;`);

const now = dayjs().toISOString();
const pollInfo = db.prepare('INSERT INTO polls (title, description, status, created_at) VALUES (?, ?, ?, ?)')
  .run('Votación de Ejemplo', 'Elige tu opción favorita', 'open', now);
const pollId = pollInfo.lastInsertRowid;

const options = ['A', 'B', 'C'];
const insertOpt = db.prepare('INSERT INTO options (poll_id, label, ord) VALUES (?, ?, ?)');
options.forEach((label, idx) => insertOpt.run(pollId, label, idx));

const nanoid = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);
const insertTok = db.prepare('INSERT INTO tokens (poll_id, code) VALUES (?, ?)');
for (let i = 0; i < 5; i++) insertTok.run(pollId, nanoid());

console.log('Seed complete. Created poll id:', pollId);
