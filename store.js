import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const file = () => path.join(config.dataDir, 'history.json');

let cache = null;

/** history = { snapshots: [{t, items: {name: {s:[price, listings], c:[price, listings, capped]}}}], lastRun } */
export function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(file(), 'utf8'));
    if (!Array.isArray(cache.snapshots)) throw new Error('bad file');
  } catch {
    cache = { snapshots: [], lastRun: null };
  }
  return cache;
}

export function save(history) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(history));
  fs.renameSync(tmp, file()); // atomic replace, so a crash never corrupts history
  cache = history;
}

/**
 * Keep every snapshot from the last 8 days, then one per day up to 90 days.
 */
export function prune(snapshots, now = Date.now()) {
  const keep = [];
  const seenDays = new Set();
  for (const s of [...snapshots].sort((a, b) => b.t - a.t)) {
    const age = now - s.t;
    if (age <= 8 * DAY) keep.push(s);
    else if (age <= 90 * DAY) {
      const day = Math.floor(s.t / DAY);
      if (!seenDays.has(day)) { seenDays.add(day); keep.push(s); }
    }
  }
  return keep.sort((a, b) => a.t - b.t);
}

export function addSnapshot(snapshot, lastRun) {
  const h = load();
  const next = { snapshots: prune([...h.snapshots, snapshot]), lastRun };
  save(next);
  return next;
}

export function setLastRun(lastRun) {
  const h = load();
  save({ ...h, lastRun });
}
