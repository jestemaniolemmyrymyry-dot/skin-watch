import { config, loadWatchlist } from './config.js';
import { collectSteam } from './steam.js';
import { collectCsfloat } from './csfloat.js';
import { addSnapshot, setLastRun } from './store.js';

let running = false;
export const isRunning = () => running;

export async function runCollection({ log = console.log } = {}) {
  if (running) return { skipped: true };
  running = true;
  const started = Date.now();
  try {
    const watchlist = loadWatchlist();
    log(`Collecting: ${watchlist.length} watchlist items, Steam top ${config.steamTopN}`);

    const steam = await collectSteam(watchlist, { topN: config.steamTopN, delayMs: config.steamDelayMs, log });
    const names = [...new Set([...watchlist, ...steam.data.keys()])];
    const csfloat = await collectCsfloat(names, { apiKey: config.csfloatKey, delayMs: config.csfloatDelayMs, log });

    const items = {};
    for (const name of names) {
      const s = steam.data.get(name);
      const c = csfloat.data.get(name);
      if (!s && !c) continue;
      items[name] = {};
      if (s) items[name].s = [s.price, s.listings];
      if (c) items[name].c = [c.price, c.listings, c.listingsCapped ? 1 : 0];
    }

    const errors = [...new Set([...steam.errors, ...csfloat.errors])].slice(0, 20);
    const lastRun = { startedAt: started, finishedAt: Date.now(), items: Object.keys(items).length, errors };

    if (Object.keys(items).length) addSnapshot({ t: started, items }, lastRun);
    else setLastRun({ ...lastRun, errors: ['No prices were collected.', ...errors] });

    log(`Done in ${Math.round((Date.now() - started) / 1000)}s: ${Object.keys(items).length} items, ${errors.length} errors`);
    errors.forEach((e) => log(`  ! ${e}`));
    return lastRun;
  } catch (e) {
    const lastRun = { startedAt: started, finishedAt: Date.now(), items: 0, errors: [e.message] };
    setLastRun(lastRun);
    log(`Collection failed: ${e.message}`);
    return lastRun;
  } finally {
    running = false;
  }
}
