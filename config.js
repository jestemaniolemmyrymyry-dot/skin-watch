import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader so the project needs no dependencies.
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

const num = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

export const config = {
  csfloatKey: process.env.CSFLOAT_API_KEY || '',
  port: num(process.env.PORT, 3000),
  intervalMinutes: Math.max(10, num(process.env.INTERVAL_MINUTES, 60)),
  steamTopN: Math.max(0, num(process.env.STEAM_TOP_N, 0)),
  csfloatDelayMs: num(process.env.CSFLOAT_DELAY_MS, 1200),
  steamDelayMs: num(process.env.STEAM_DELAY_MS, 3500),
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'docs', 'data'),
  watchlistPath: path.join(ROOT, 'watchlist.json'),
};

export function loadWatchlist() {
  try {
    const list = JSON.parse(fs.readFileSync(config.watchlistPath, 'utf8'));
    return [...new Set(list.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()))];
  } catch (e) {
    console.error('Could not read watchlist.json:', e.message);
    return [];
  }
}
