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
const tl = n => Number(n || 0).toLocaleString('tr-TR') + ' ₺';
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtD = s => { const d = parseD(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + DAYS[d.getDay()]; };
const digits = p => String(p || '').replace(/\D/g, '');
const waNum = p => { let d = digits(p); if (d.startsWith('0')) d = '9' + d; else if (d.length === 10) d = '90' + d; return d; };
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 3000);
}

/* Supabase istemcisi; ağ hatalarında tekrar dener */
const SB = window.supabase.createClient(window.BERBERIM_CONFIG.url, window.BERBERIM_CONFIG.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});
async function q(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fn();
      if (r && r.error) {
        const e = r.error;
        // iş kuralı hataları tekrar denenmez
        if (e.code && e.code !== 'PGRST000' && !/fetch|network|timeout/i.test(e.message || '')) throw e;
        last = e;
      } else return r ? r.data : r;
    } catch (e) {
      if (e && e.code && !/fetch|network|timeout/i.test(e.message || '')) throw e;
      last = e;
    }
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
