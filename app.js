const $ = (id) => document.getElementById(id);
const state = { data: null, win: 'day', filter: 'all', q: '', sort: { key: 'gap', dir: 'desc' } };

const usd = (c) => (c === null || c === undefined ? null : (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const when = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

function pctHtml(v) {
  if (v === null || v === undefined) return '<span class="na">–</span>';
  const cls = v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `<span class="pct ${cls}">${sign}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)}%</span>`;
}

// Split "AK-47 | Redline (Field-Tested)" into name + wear
function splitName(n) {
  const m = n.match(/^(.*?)\s*\(([^)]+)\)$/);
  return m ? { main: m[1], wear: m[2] } : { main: n, wear: '' };
}

async function load() {
  try {
    const res = await fetch(`data/summary.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`data file missing (${res.status})`);
    state.data = await res.json();
    render();
  } catch (e) {
    $('status').innerHTML = `<span class="err">Can't load prices: ${esc(e.message)}. Retrying every minute.</span>`;
  }
}

function renderStatus(d) {
  const parts = [];
  if (d.running) parts.push('Checking prices now…');
  else if (d.latestAt) parts.push(`Updated ${ago(d.latestAt)}`);
  if (d.nextRunAt && !d.running) parts.push(`next check around ${when(d.nextRunAt)}`);
  let html = esc(parts.join(', '));
  const errs = d.lastRun?.errors || [];
  if (errs.length) html += ` <span class="err" title="${esc(errs.join('\n'))}">${errs.length} issue${errs.length > 1 ? 's' : ''} in last check</span>`;
  $('status').innerHTML = html || 'Waiting for the first price check';
}

function renderHero(d) {
  const a = d.availability;
  if (!d.items.length) {
    $('headline').textContent = 'No prices collected yet';
    $('subline').textContent = d.lastRun?.errors?.[0]
      || 'On GitHub, open Actions → Collect prices → Run workflow. Prices appear here a few minutes after it finishes.';
    $('avail').hidden = true;
    return;
  }
  const g = d.spread.medianGapPct;
  if (g === null) {
    $('headline').textContent = 'No skin is listed on both markets yet';
    $('subline').textContent = 'Price gaps appear once a skin has a listing on Steam and on CSFloat.';
  } else {
    const abs = Math.abs(g).toFixed(0);
    $('headline').textContent = Math.abs(g) < 0.5
      ? 'Steam and CSFloat are priced the same'
      : g > 0 ? `Steam asks ${abs}% more than CSFloat` : `CSFloat asks ${abs}% more than Steam`;
    $('subline').textContent = `Median gap between the cheapest listings, across ${a.both} skins listed on both markets. CSFloat is cheaper for ${d.spread.csfloatCheaper}, Steam for ${d.spread.steamCheaper}.`;
  }

  const segs = [['both', 'both', 'On both'], ['s', 'steamOnly', 'Steam only'], ['c', 'csfloatOnly', 'CSFloat only'], ['n', 'neither', 'No listings']];
  $('availBar').innerHTML = segs.filter(([, k]) => a[k] > 0).map(([c, k]) => `<span class="${c}" style="width:${(a[k] / a.total) * 100}%"></span>`).join('');
  $('availBar').setAttribute('aria-label', segs.map(([, k, l]) => `${l}: ${a[k]}`).join(', '));
  const sw = { both: 'background:linear-gradient(90deg,var(--steam) 50%,var(--float) 50%)', s: 'background:var(--steam)', c: 'background:var(--float)', n: 'background:var(--track)' };
  $('availKey').innerHTML = segs.filter(([, k]) => a[k] > 0 || k !== 'neither').map(([c, k, l]) => `<li><i style="${sw[c]}"></i>${l} <b>${a[k]}</b></li>`).join('') + `<li>of <b>${a.total}</b> tracked</li>`;
  $('avail').hidden = false;
}

function marketPanel(d, key, title) {
  const w = state.win;
  const label = w === 'day' ? '24 hours' : '7 days';
  const s = d.markets?.[key]?.[w];
  const ok = d.windows?.[w]?.available;
  if (!ok || !s || !s.items) {
    return `<h3>${title}</h3><p class="note">No ${label} comparison yet.</p>`;
  }
  const movers = d.items.filter((i) => i[key][w] !== null);
  const risers = [...movers].filter((i) => i[key][w] > 0.05).sort((a, b) => b[key][w] - a[key][w]).slice(0, 5);
  const fallers = [...movers].filter((i) => i[key][w] < -0.05).sort((a, b) => a[key][w] - b[key][w]).slice(0, 5);
  const li = (i) => `<li><span class="n" title="${esc(i.name)}">${esc(i.name)}</span>${pctHtml(i[key][w])}</li>`;
  return `
    <h3>${title}</h3>
    <div class="big"><strong class="${s.average > 0.05 ? 'up' : s.average < -0.05 ? 'down' : ''}">${pctHtml(s.average).replace(/<[^>]+>/g, '')}</strong><span>average change over ${label}</span></div>
    <div class="tally"><span><span class="u">${s.up}</span> rose</span><span><span class="d">${s.down}</span> fell</span><span>${s.flat} unchanged</span></div>
    <div class="lists">
      <div><h4>Biggest rises</h4><ol>${risers.map(li).join('') || '<li class="none">None</li>'}</ol></div>
      <div><h4>Biggest drops</h4><ol>${fallers.map(li).join('') || '<li class="none">None</li>'}</ol></div>
    </div>`;
}

function renderMoves(d) {
  const w = state.win;
  const win = d.windows?.[w];
  const hours = w === 'day' ? 24 : 168;
  if (!d.items.length) $('winNote').textContent = '';
  else if (win?.available) $('winNote').textContent = `Comparing ${when(d.latestAt)} with ${when(win.referenceAt)}.`;
  else {
    const ready = d.oldestAt ? d.oldestAt + hours * 3600e3 : null;
    $('winNote').textContent = `${w === 'day' ? 'Daily' : 'Weekly'} changes appear once ${w === 'day' ? '24 hours' : '7 days'} of prices are saved${ready ? `, around ${when(ready)}` : ''}.`;
  }
  $('mk-steam').innerHTML = marketPanel(d, 'steam', 'Steam Market');
  $('mk-csfloat').innerHTML = marketPanel(d, 'csfloat', 'CSFloat');
}

const sorters = {
  name: (i) => i.name.toLowerCase(),
  steam: (i) => i.steam.price,
  csfloat: (i) => i.csfloat.price,
  gap: (i) => (i.gapPct === null ? null : Math.abs(i.gapPct)),
  sChange: (i) => i.steam[state.win],
  cChange: (i) => i.csfloat[state.win],
};

function spreadHtml(i) {
  if (i.gapPct === null) {
    const where = i.steam.price !== null ? 'Steam only' : i.csfloat.price !== null ? 'CSFloat only' : 'No listings';
    return `<span class="na">${where}</span>`;
  }
  const steamDearer = i.gapPct >= 0;
  // gapPct is relative to CSFloat; express it relative to the cheaper market
  const rel = steamDearer ? i.gapPct : ((i.csfloat.price - i.steam.price) / i.steam.price) * 100;
  const pos = Math.min(rel, 60) / 60; // 0..1 across the track
  const lo = steamDearer ? 'var(--float)' : 'var(--steam)';
  const hi = steamDearer ? 'var(--steam)' : 'var(--float)';
  const cheaper = steamDearer ? 'CSFloat' : 'Steam';
  const text = rel < 0.5 ? 'Same price' : `<b>${cheaper}</b> ${rel.toFixed(rel < 10 ? 1 : 0)}%${rel > 60 ? '+' : ''} cheaper`;
  const left = `calc(6px + (100% - 12px) * ${pos.toFixed(3)})`;
  return `<div class="spread" style="--lo:${lo};--hi:${hi}">
    <div class="track" aria-hidden="true"><span class="span" style="width:${left}"></span><span class="dot lo"></span><span class="dot hi" style="left:${left}"></span></div>
    <span class="label">${text}</span></div>`;
}

function renderTable(d) {
  const q = state.q.toLowerCase();
  const f = state.filter;
  let rows = d.items.filter((i) => {
    if (q && !i.name.toLowerCase().includes(q)) return false;
    const s = i.steam.price !== null, c = i.csfloat.price !== null;
    if (f === 'both') return s && c;
    if (f === 'steam') return s && !c;
    if (f === 'csfloat') return c && !s;
    return true;
  });
  const { key, dir } = state.sort;
  const get = sorters[key];
  rows.sort((a, b) => {
    const x = get(a), y = get(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1; // blanks always last
    if (y === null) return -1;
    const r = x < y ? -1 : x > y ? 1 : 0;
    return dir === 'asc' ? r : -r;
  });

  document.querySelectorAll('#grid th').forEach((th) => {
    const k = th.querySelector('button')?.dataset.sort;
    if (k === key) th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
  });

  const w = state.win;
  const winLabel = w === 'day' ? '24h' : '7d';
  $('rows').innerHTML = rows.map((i) => {
    const n = splitName(i.name);
    const sCount = i.steam.listings === null ? '' : `${i.steam.listings.toLocaleString()} listed`;
    const cCount = i.csfloat.listings === null ? '' : `${i.csfloat.listings}${i.csfloat.capped ? '+' : ''} listed`;
    return `<tr>
      <td class="skin">${esc(n.main)}${n.wear ? `<small>${esc(n.wear)}</small>` : ''}</td>
      <td class="num" data-label="Steam">${usd(i.steam.price) ? `<span class="price">${usd(i.steam.price)}</span>` : '<span class="na">None listed</span>'}<span class="count">${sCount}</span></td>
      <td class="num" data-label="CSFloat">${usd(i.csfloat.price) ? `<span class="price">${usd(i.csfloat.price)}</span>` : '<span class="na">None listed</span>'}<span class="count">${cCount}</span></td>
      <td class="gap">${spreadHtml(i)}</td>
      <td class="num" data-label="Steam ${winLabel}">${pctHtml(i.steam[w])}</td>
      <td class="num" data-label="CSFloat ${winLabel}">${pctHtml(i.csfloat[w])}</td>
    </tr>`;
  }).join('');

  const empty = $('empty');
  if (!d.items.length) { empty.hidden = false; empty.textContent = 'Skins appear here after the first price check finishes.'; }
  else if (!rows.length) { empty.hidden = false; empty.textContent = 'No skins match. Clear the search or pick another filter.'; }
  else empty.hidden = true;
}

function render() {
  const d = state.data;
  if (!d) return;
  renderStatus(d);
  renderHero(d);
  renderMoves(d);
  renderTable(d);
}

// Controls
document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
  state.win = b.dataset.win;
  document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  render();
}));
document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
  state.filter = b.dataset.f;
  document.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  render();
}));
document.querySelectorAll('#grid th button').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.sort;
  state.sort = state.sort.key === k ? { key: k, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'name' ? 'asc' : 'desc' };
  render();
}));
$('q').addEventListener('input', (e) => { state.q = e.target.value.trim(); render(); });

load();
setInterval(load, 5 * 60000);
