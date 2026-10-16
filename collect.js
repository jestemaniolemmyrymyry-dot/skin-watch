// Runs once per GitHub Actions job: collects prices, then writes the
// data files the website reads (docs/data/history.json and summary.json).
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../lib/config.js';
import { runCollection } from '../lib/collector.js';
import { load } from '../lib/store.js';
import { buildSummary } from '../lib/summary.js';

const only = process.argv.includes('--summary-only');
if (!only) await runCollection();

const history = load();
const latest = history.snapshots.at(-1)?.t ?? null;
const summary = buildSummary(history, {
  intervalMinutes: config.intervalMinutes,
  nextRunAt: latest ? latest + config.intervalMinutes * 60e3 : null,
  running: false,
});
fs.mkdirSync(config.dataDir, { recursive: true });
fs.writeFileSync(path.join(config.dataDir, 'summary.json'), JSON.stringify(summary));
console.log(`Wrote summary.json with ${summary.items.length} items`);
