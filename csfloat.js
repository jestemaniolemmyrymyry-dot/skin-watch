import { getJson, sleep } from './http.js';

const BASE = 'https://csfloat.com/api/v1/listings';
const PAGE = 50; // CSFloat's maximum page size

/**
 * For each item, fetch the cheapest buy-now listings.
 * Returns Map<name, {price (USD cents) | null, listings (0..50), listingsCapped: bool}>.
 */
export async function collectCsfloat(names, { apiKey, delayMs = 1200, log = console.log } = {}) {
  const out = new Map();
  const errors = [];
  if (!apiKey) {
    errors.push('CSFLOAT_API_KEY is not set, so CSFloat prices were skipped.');
    return { data: out, errors };
  }
  let i = 0;
  for (const name of names) {
    i++;
    const qs = new URLSearchParams({ market_hash_name: name, sort_by: 'lowest_price', type: 'buy_now', limit: String(PAGE) });
    try {
      const body = await getJson(`${BASE}?${qs}`, { headers: { Authorization: apiKey }, label: `CSFloat ${name}` });
      // The API has returned both a bare array and {data: [...]} over time.
      const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
      const exact = list.filter((l) => !l?.item?.market_hash_name || l.item.market_hash_name === name);
      const prices = exact.map((l) => Number(l.price)).filter((p) => Number.isFinite(p) && p > 0);
      out.set(name, {
        price: prices.length ? Math.min(...prices) : null,
        listings: exact.length,
        listingsCapped: list.length >= PAGE,
      });
    } catch (e) {
      if (/HTTP 401|HTTP 403/.test(e.message)) {
        errors.push('CSFloat rejected the API key (401/403). Check CSFLOAT_API_KEY.');
        break;
      }
      errors.push(e.message);
    }
    if (i % 25 === 0) log(`CSFloat: ${i}/${names.length}`);
    await sleep(delayMs);
  }
  return { data: out, errors };
}
