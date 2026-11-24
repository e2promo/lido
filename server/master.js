import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword, now, uid, token as makeToken } from './util.js';
import { DEFAULT_ORG_ID } from './db.js';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const masterDb = new DatabaseSync(path.join(DATA_DIR, 'master.db'));
masterDb.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

masterDb.exec(`
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  industry TEXT NOT NULL DEFAULT 'universal',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  org_id TEXT NOT NULL DEFAULT 'demo',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

const userColumns = masterDb.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('org_id')) masterDb.exec("ALTER TABLE users ADD COLUMN org_id TEXT NOT NULL DEFAULT 'demo'");

if (!masterDb.prepare('SELECT id FROM organizations LIMIT 1').get()) {
  masterDb.prepare(`INSERT INTO organizations (id, name, slug, industry, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(DEFAULT_ORG_ID, 'Студия красоты «Локон»', 'demo', 'beauty', now(-8000));
}
if (!masterDb.prepare('SELECT id FROM users LIMIT 1').get()) {
  masterDb.prepare('INSERT INTO users (id, name, email, password_hash, org_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('u_demo', 'Анастасия Волкова', 'demo@lido.ru', hashPassword('lido2026'), DEFAULT_ORG_ID, now(-8000));
} else {
  masterDb.prepare("UPDATE users SET org_id = ? WHERE org_id IS NULL OR org_id = ''").run(DEFAULT_ORG_ID);
}

export function findUserByEmail(email) {
  return masterDb.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim()) || null;
}

export function findUserByToken(token) {
  if (!token) return null;
  return masterDb.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token) || null;
}

export function createSession(userId) {
  const t = makeToken();
  masterDb.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(t, userId, now());
  return t;
}

export function getOrganizations() {
  return masterDb.prepare('SELECT * FROM organizations ORDER BY created_at DESC').all().map((r) => ({ ...r }));
}

export function getOrganization(orgId) {
  return masterDb.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId) || null;
}

export function createOrganization({ name, slug, industry }) {
  const id = uid('org_');
  masterDb.prepare('INSERT INTO organizations (id, name, slug, industry, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, slug, industry, now());
  return getOrganization(id);
}

export function createUser({ name, email, password, orgId }) {
  const id = uid('u_');
  masterDb.prepare('INSERT INTO users (id, name, email, password_hash, org_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, email, hashPassword(password), orgId, now());
  return masterDb.prepare('SELECT id, name, email, org_id FROM users WHERE id = ?').get(id);
}

export function setUserOrg(userId, orgId) {
  masterDb.prepare('UPDATE users SET org_id = ? WHERE id = ?').run(orgId, userId);
}
