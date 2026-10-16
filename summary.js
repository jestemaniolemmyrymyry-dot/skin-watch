const HOUR = 3600e3;
const DAY = 24 * HOUR;

// A reference snapshot must be at least this close to the target age.
const WINDOWS = {
  day: { age: DAY, tolerance: 3 * HOUR },
  week: { age: 7 * DAY, tolerance: 12 * HOUR },
};

function findReference(snapshots, latest, { age, tolerance }) {
  const target = latest.t - age;
  let best = null;
  for (const s of snapshots) {
    if (s === latest) continue;
    const d = Math.abs(s.t - target);
    if (d <= tolerance && (!best || d < Math.abs(best.t - target))) best = s;
  }
  return best;
}

const pct = (now, then) =>
  Number.isFinite(now) && Number.isFinite(then) && then > 0 ? ((now - then) / then) * 100 : null;

const round = (n, d = 2) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

function median(arr) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function marketStats(items, market, win) {
  const changes = items.map((i) => i[market][win]).filter((v) => v !== null);
  return {
    items: changes.length,
    up: changes.filter((v) => v > 0.05).length,
    down: changes.filter((v) => v < -0.05).length,
    flat: changes.filter((v) => Math.abs(v) <= 0.05).length,
    average: round(changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null),
    median: round(median(changes)),
  };
}

export function buildSummary(history, { intervalMinutes, nextRunAt, running }) {
  const snaps = history.snapshots;
  const base = {
    generatedAt: Date.now(),
    lastRun: history.lastRun,
    nextRunAt,
    running,
    intervalMinutes,
    snapshotCount: snaps.length,
    oldestAt: snaps[0]?.t ?? null,
  };
  if (!snaps.length) return { ...base, latestAt: null, items: [] };

  const latest = snaps[snaps.length - 1];
  const refs = {
    day: findReference(snaps, latest, WINDOWS.day),
    week: findReference(snaps, latest, WINDOWS.week),
  };

  const items = Object.entries(latest.items).map(([name, v]) => {
    const [sp, sl] = v.s || [null, null];
    const [cp, cl, capped] = v.c || [null, null, false];
    const change = (m, idx) => ({
      day: refs.day ? round(pct(idx, refs.day.items[name]?.[m]?.[0])) : null,
      week: refs.week ? round(pct(idx, refs.week.items[name]?.[m]?.[0])) : null,
    });
    return {
      name,
      steam: { price: sp, listings: sl, ...change('s', sp) },
      csfloat: { price: cp, listings: cl, capped: !!capped, ...change('c', cp) },
      // Positive gap = Steam is more expensive than CSFloat.
      gapPct: round(pct(sp, cp), 1),
    };
  });

  const onSteam = (i) => i.steam.price !== null;
  const onFloat = (i) => i.csfloat.price !== null;
  const gaps = items.map((i) => i.gapPct).filter((g) => g !== null);

  return {
    ...base,
    latestAt: latest.t,
    windows: {
      day: { available: !!refs.day, referenceAt: refs.day?.t ?? null },
      week: { available: !!refs.week, referenceAt: refs.week?.t ?? null },
    },
    availability: {
      total: items.length,
      both: items.filter((i) => onSteam(i) && onFloat(i)).length,
      steamOnly: items.filter((i) => onSteam(i) && !onFloat(i)).length,
      csfloatOnly: items.filter((i) => !onSteam(i) && onFloat(i)).length,
      neither: items.filter((i) => !onSteam(i) && !onFloat(i)).length,
    },
    spread: {
      medianGapPct: round(median(gaps), 1),
      steamCheaper: gaps.filter((g) => g < 0).length,
      csfloatCheaper: gaps.filter((g) => g > 0).length,
    },
    markets: {
      steam: { day: marketStats(items, 'steam', 'day'), week: marketStats(items, 'steam', 'week') },
      csfloat: { day: marketStats(items, 'csfloat', 'day'), week: marketStats(items, 'csfloat', 'week') },
    },
    items,
  };
}

export function itemHistory(history, name) {
  return history.snapshots
    .filter((s) => s.items[name])
    .map((s) => ({ t: s.t, steam: s.items[name].s?.[0] ?? null, csfloat: s.items[name].c?.[0] ?? null }));
}
