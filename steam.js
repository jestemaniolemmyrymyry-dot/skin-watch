import { getJson, sleep } from './http.js';

const SEARCH = 'https://steamcommunity.com/market/search/render/';
const OVERVIEW = 'https://steamcommunity.com/market/priceoverview/';

function parseUsd(text) {
  if (typeof text !== 'string' || !text.trim().startsWith('$')) return null;
  const n = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function fromResult(r) {
  // sell_price is in the smallest unit of whatever currency Steam chose for us.
  // Only trust it when the display text is in US dollars.
  const usd = typeof r.sell_price_text === 'string' && r.sell_price_text.trim().startsWith('$');
  return {
    price: usd && r.sell_listings > 0 ? r.sell_price : null,
    listings: Number.isFinite(r.sell_listings) ? r.sell_listings : null,
    needsUsd: !usd && r.sell_listings > 0,
  };
}

async function search(params, delayMs) {
  const qs = new URLSearchParams({
    appid: '730', norender: '1', search_descriptions: '0',
    sort_column: 'popular', sort_dir: 'desc', start: '0', count: '100', ...params,
  });
  const data = await getJson(`${SEARCH}?${qs}`, { label: 'Steam search' });
  await sleep(delayMs);
  if (!data || data.success === false || !Array.isArray(data.results)) throw new Error('Steam search returned no results');
  return data.results;
}

async function priceOverviewUsd(name, delayMs) {
  const qs = new URLSearchParams({ appid: '730', currency: '1', market_hash_name: name });
  const data = await getJson(`${OVERVIEW}?${qs}`, { label: `Steam price ${name}` });
  await sleep(delayMs);
  return data && data.success ? parseUsd(data.lowest_price) : null;
}

/**
 * Returns Map<market_hash_name, {price (USD cents) | null, listings | null}>.
 */
export async function collectSteam(watchlist, { topN = 0, delayMs = 3500, log = console.log } = {}) {
  const out = new Map();
  const errors = [];

  // 1) Popular items in bulk (100 per request).
  for (let start = 0; start < topN; start += 100) {
    try {
      const results = await search({ start: String(start), count: String(Math.min(100, topN - start)) }, delayMs);
      for (const r of results) if (r.hash_name) out.set(r.hash_name, fromResult(r));
      log(`Steam: popular items ${start + 1}-${start + results.length}`);
      if (results.length < 100) break;
    } catch (e) { errors.push(e.message); break; }
  }

  // 2) Watchlist items that weren't in the popular pages.
  for (const name of watchlist) {
    if (out.has(name)) continue;
    try {
      const results = await search({ query: name, count: '10' }, delayMs);
      const hit = results.find((r) => r.hash_name === name);
      out.set(name, hit ? fromResult(hit) : { price: null, listings: 0, needsUsd: false });
    } catch (e) { errors.push(e.message); }
  }

  // 3) Fix up prices that came back in a non-USD currency.
  for (const [name, v] of out) {
    if (!v.needsUsd) { delete v.needsUsd; continue; }
    try { v.price = await priceOverviewUsd(name, delayMs); } catch (e) { errors.push(e.message); }
    delete v.needsUsd;
  }

  return { data: out, errors };
}
