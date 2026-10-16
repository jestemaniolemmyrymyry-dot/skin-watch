export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UA = 'Mozilla/5.0 (skin-market-tracker; self-hosted price comparison)';

/**
 * GET JSON with timeout and polite retries on 429 / 5xx.
 */
export async function getJson(url, { headers = {}, retries = 3, label = 'request' } = {}) {
  let attempt = 0;
  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt > retries) throw new Error(`${label}: HTTP ${res.status} after ${retries} retries`);
        const ra = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 15000 * attempt;
        console.warn(`${label}: HTTP ${res.status}, waiting ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`${label}: HTTP ${res.status} ${body.slice(0, 160)}`);
      }
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') {
        if (attempt > retries) throw new Error(`${label}: timed out`);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
