/* Berberim ortak yardımcılar */
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const DSH = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const toMin = s => { const [a, b] = String(s).split(':').map(Number); return a * 60 + b; };
const toHM = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const hm = s => String(s || '').slice(0, 5);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tl = n => Math.round(Number(n || 0)).toLocaleString('tr-TR') + ' ₺';
const tlShort = n => { n = Number(n || 0); return n >= 10000 ? (Math.round(n / 100) / 10).toLocaleString('tr-TR') + 'b' : Math.round(n).toLocaleString('tr-TR'); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parseD = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const fmtD = s => { const d = parseD(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + DAYS[d.getDay()]; };
const fmtDs = s => { const d = parseD(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
const daysUntil = s => Math.round((parseD(s) - parseD(ymd(new Date()))) / 864e5);
const digits = p => String(p || '').replace(/\D/g, '');
const waNum = p => { let d = digits(p); if (d.startsWith('0')) d = '9' + d; else if (d.length === 10) d = '90' + d; return d; };
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* Dükkan linki: /?mg-barbers  veya /?b=mg-barbers ; eski alan adı için varsayılan */
function slugFromUrl() {
  const sp = new URLSearchParams(location.search);
  let s = sp.get('b');
  if (!s) { for (const [k, v] of sp) { if (!v && /^[a-z0-9-]{3,40}$/i.test(k)) { s = k; break; } } }
  if (!s) s = (window.BERBERIM_CONFIG.hostDefaults || {})[location.hostname] || '';
  return (s || '').toLowerCase();
}
function shopLink(slug) {
  const def = (window.BERBERIM_CONFIG.hostDefaults || {})[location.hostname];
  if (def === slug) return location.origin + '/';
  return (window.BERBERIM_CONFIG.publicOrigin || location.origin) + '/?' + slug;
}

function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 3000);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Kopyalandı'); }
  catch (e) { toast('Kopyalanamadı, metni elle seçin.'); }
}

/* Veritabanı istemcisi; ağ hatalarında tekrar dener */
const SB = window.supabase.createClient(window.BERBERIM_CONFIG.url, window.BERBERIM_CONFIG.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});
const isNetErr = e => !e || !e.code || /fetch|network|timeout|load failed/i.test(e.message || '');
async function q(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fn();
      if (r && r.error) { if (!isNetErr(r.error) && r.error.code !== 'PGRST000') throw r.error; last = r.error; }
      else return r ? r.data : r;
    } catch (e) { if (e && e.code && !isNetErr(e)) throw e; last = e; }
    await new Promise(r => setTimeout(r, 600 * (i + 1)));
  }
  throw last || new Error('Bağlantı hatası');
}

function freeSlots(shop, date, dur, busy) {
  const o = toMin(shop.open_time), c = toMin(shop.close_time), step = shop.step, out = [];
  const b = busy.map(x => [toMin(x.start_time), toMin(x.start_time) + x.dur]);
  const now = new Date(), isToday = date === ymd(now), nowM = now.getHours() * 60 + now.getMinutes();
  for (let m = o; m + step <= c; m += step) {
    const end = m + dur, past = isToday && m <= nowM;
    out.push({ t: toHM(m), free: !past && end <= c && !b.some(([a, z]) => m < z && end > a) });
  }
  return out;
}

/* Basit çubuk grafik (SVG). series: [{label, value, value2?, hl?}] */
function barChart(series, opts = {}) {
  const W = 320, H = opts.h || 150, top = 18, bottom = 22, n = series.length;
  const max = Math.max(1, ...series.map(s => Math.max(s.value, s.value2 || 0)));
  const slot = W / n, two = series.some(s => s.value2 != null);
  const bw = Math.min(two ? 14 : 28, slot * (two ? 0.34 : 0.58));
  const y = v => top + (H - top - bottom) * (1 - v / max);
  let g = `<line class="grid" x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}"/>`;
  series.forEach((s, i) => {
    const cx = slot * i + slot / 2;
    const x1 = two ? cx - bw - 1 : cx - bw / 2;
    const h1 = Math.max(s.value ? 2 : 0, H - bottom - y(s.value));
    g += `<rect class="bar ${s.hl ? 'hl' : ''}" x="${x1.toFixed(1)}" y="${(H - bottom - h1).toFixed(1)}" width="${bw.toFixed(1)}" height="${h1.toFixed(1)}" rx="3"><title>${esc(s.label)}: ${esc(opts.fmt ? opts.fmt(s.value) : s.value)}</title></rect>`;
    if (two) {
      const h2 = Math.max(s.value2 ? 2 : 0, H - bottom - y(s.value2));
      g += `<rect class="bar exp" x="${(cx + 1).toFixed(1)}" y="${(H - bottom - h2).toFixed(1)}" width="${bw.toFixed(1)}" height="${h2.toFixed(1)}" rx="3"><title>${esc(s.label)} gider: ${esc(opts.fmt ? opts.fmt(s.value2) : s.value2)}</title></rect>`;
    }
    if (opts.showVal !== false && s.value) g += `<text class="val" x="${two ? x1 + bw / 2 : cx}" y="${(H - bottom - h1 - 5).toFixed(1)}" text-anchor="middle">${esc(opts.short ? opts.short(s.value) : s.value)}</text>`;
    g += `<text class="lbl" x="${cx}" y="${H - 6}" text-anchor="middle">${esc(s.label)}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria || 'Grafik')}">${g}</svg></div>`;
}

const ICON = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.4 3.5 5.2"/></svg>',
  cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
};
