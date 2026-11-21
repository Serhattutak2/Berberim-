/* Berberim · müşteri randevu sayfası (fiyat göstermez) */
const ERR = {
  DOLU: 'Bu saat az önce doldu, başka bir saat seçin.',
  ISIM: 'Adınızı ve soyadınızı yazın.',
  TELEFON: 'Telefon numarası en az 10 haneli olmalı.',
  KAPALI_ONLINE: 'Bu dükkan şu an online randevu almıyor.',
  KAPALI: 'Bu gün dükkan kapalı.',
  SAAT: 'Bu saat çalışma saatlerinin dışında.',
  GECMIS: 'Geçmiş bir saat seçilemez.',
  TARIH: 'En fazla 30 gün sonrası için randevu alınabilir.',
  LIMIT: 'Bu numarayla zaten 3 açık randevu var.',
  HIZMET_YOK: 'Hizmet bulunamadı, sayfayı yenileyin.'
};
const errText = e => { const k = Object.keys(ERR).find(k => (e && e.message || '').includes(k)); return k ? ERR[k] : 'Bağlantı sorunu oldu, tekrar deneyin.'; };

const SLUG = slugFromUrl();
const app = document.getElementById('app'), dock = document.getElementById('dock');
let SHOP = null, BUSY = [], busyFor = null, loadingSlots = false;
const C = { svc: null, date: null, time: null, done: null, view: 'yeni', lookup: '', mine: null, err: '', name: '', phone: '' };
try { localStorage.removeItem('berberim_me'); } catch (e) {}

async function init() {
  if (!SLUG) return landing();
  try {
    SHOP = await q(() => SB.rpc('b_shop', { p_slug: SLUG }));
    if (!SHOP) { app.innerHTML = `<div class="head"><h1>Link bulunamadı</h1><p>Bu randevu linki geçersiz. Berberinizden doğru linki isteyin.</p></div>`; return; }
    document.title = SHOP.name + ' · Online Randevu';
    render();
  } catch (e) {
    app.innerHTML = `<div class="head"><h1>Sayfa yüklenemedi</h1><p>İnternet bağlantınızı kontrol edip tekrar deneyin.</p></div><button class="btn dark" onclick="location.reload()">Tekrar dene</button><p class="foot">${esc((e && (e.message || e.code)) || '')}</p>`;
  }
}

async function loadBusy(date) {
  loadingSlots = true; busyFor = date;
  try { const r = await q(() => SB.rpc('b_busy', { p_slug: SLUG, p_date: date })); if (busyFor === date) BUSY = r || []; }
  catch (e) { if (busyFor === date) BUSY = null; }
  loadingSlots = false; if (busyFor === date) render();
}

function head() {
  const s = SHOP, closed = s.closed_days.length ? s.closed_days.map(i => DSH[i]).join(', ') + ' kapalı' : 'Her gün açık';
  return `<header class="head"><h1>${esc(s.name)}</h1><p>${s.open_time}–${s.close_time} · ${closed}${s.address ? '<br>' + esc(s.address) : ''}</p><div class="pole" aria-hidden="true"></div></header>`;
}
function keepForm() { const n = document.getElementById('cName'), p = document.getElementById('cPhone'); if (n) { C.name = n.value; C.phone = p.value; } }

function render() {
  const s = SHOP; dock.hidden = true;
  if (!s.open) {
    app.innerHTML = head() + `<div class="card lock"><h2>Online randevu şu an kapalı</h2><p class="muted">Randevu için dükkanı arayabilirsiniz.</p>${s.phone ? `<a class="btn dark" href="tel:${esc(digits(s.phone))}">${esc(s.phone)}</a>` : ''}</div>`;
    return;
  }
  if (C.done) {
    const a = C.done;
    app.innerHTML = head() + `<div class="card lock"><div class="tick">✓</div><h2>Randevunuz alındı</h2>
      <p style="font-size:18px"><b>${esc(fmtD(a.date))}</b><br>saat <b>${esc(a.time)}</b> · ${esc(a.service)}</p>
      <p class="muted">Gelemeyecekseniz "Randevularım" bölümünden iptal edebilirsiniz.</p>
      <button class="btn ghost" id="again">Yeni randevu al</button></div>`;
    document.getElementById('again').onclick = () => { C.done = null; C.time = null; C.name = ''; C.phone = ''; busyFor = null; render(); };
    return;
  }
  const seg = `<div class="seg" role="tablist"><button role="tab" class="${C.view === 'yeni' ? 'on' : ''}" data-v="yeni">Randevu al</button><button role="tab" class="${C.view === 'benim' ? 'on' : ''}" data-v="benim">Randevularım</button></div>`;
  if (C.view === 'benim') return renderMine(seg);

  if (!C.svc || !s.services.find(x => x.id === C.svc)) C.svc = s.services[0].id;
  const svc = s.services.find(x => x.id === C.svc);
  const days = []; for (let i = 0; i < 14; i++) { const d = addDays(new Date(), i); days.push({ d, s: ymd(d), closed: s.closed_days.includes(d.getDay()) }); }
  if (!C.date || days.find(x => x.s === C.date)?.closed) C.date = (days.find(x => !x.closed) || days[0]).s;
  if (busyFor !== C.date) { BUSY = []; loadBusy(C.date); }

  let slotHtml;
  if (loadingSlots) slotHtml = '<p class="loading" style="padding:16px 0">Boş saatler yükleniyor…</p>';
  else if (BUSY === null) slotHtml = '<p class="empty">Saatler yüklenemedi. <button class="link" id="retry">Tekrar dene</button></p>';
  else {
    const slots = freeSlots(s, C.date, svc.dur, BUSY);
    if (C.time && !slots.find(x => x.t === C.time && x.free)) C.time = null;
    const n = slots.filter(x => x.free).length;
    slotHtml = n ? `<div class="slots">${slots.map(x => `<button class="slot ${x.t === C.time ? 'on' : ''}" data-t="${x.t}" ${x.free ? '' : 'disabled aria-label="' + x.t + ' dolu"'}>${x.t}</button>`).join('')}</div>`
      : '<p class="empty">Bu gün dolu. Başka bir gün seçin.</p>';
  }

  app.innerHTML = head() + seg + `
  <section class="sec"><h2>Hizmet</h2><div class="chips">${s.services.map(x => `<button class="chip ${x.id === svc.id ? 'on' : ''}" data-svc="${esc(x.id)}">${esc(x.name)}<small>${x.dur} dk</small></button>`).join('')}</div></section>
  <section class="sec"><h2>Gün</h2><div class="chips">${days.map(x => `<button class="chip day ${x.s === C.date ? 'on' : ''}" data-day="${x.s}" ${x.closed ? 'disabled' : ''}><small>${x.s === ymd(new Date()) ? 'Bugün' : DSH[x.d.getDay()]}</small><b>${x.d.getDate()}</b><small>${x.closed ? 'Kapalı' : MONTHS[x.d.getMonth()].slice(0, 3)}</small></button>`).join('')}</div></section>
  <section class="sec"><div class="sec-h"><h2>Saat</h2><span class="muted">${esc(fmtD(C.date))}</span></div>${slotHtml}</section>
  <section class="sec"><h2>Bilgileriniz</h2>
    <label for="cName">Ad soyad<input id="cName" autocomplete="off" maxlength="80" value="${esc(C.name)}" placeholder="Adınız ve soyadınız"></label>
    <label for="cPhone">Telefon<input id="cPhone" type="tel" inputmode="tel" autocomplete="off" maxlength="20" value="${esc(C.phone)}" placeholder="05xx xxx xx xx"></label>
    ${C.err ? `<p class="err" role="alert">${esc(C.err)}</p>` : ''}
  </section>
  <p class="foot">Randevu sistemi: Berberim</p>`;

  if (C.time) {
    dock.hidden = false;
    dock.innerHTML = `<div class="dock-in"><div class="sum"><b>${C.time} · ${esc(svc.name)}</b>${esc(fmtD(C.date))}</div><button class="btn" id="book">Onayla</button></div>`;
    document.getElementById('book').onclick = book;
  }

  app.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { keepForm(); C.view = b.dataset.v; C.err = ''; render(); });
  app.querySelectorAll('[data-svc]').forEach(b => b.onclick = () => { keepForm(); C.svc = b.dataset.svc; C.err = ''; render(); });
  app.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { keepForm(); C.date = b.dataset.day; C.time = null; C.err = ''; render(); });
  app.querySelectorAll('.slot:not(:disabled)').forEach(b => b.onclick = () => { keepForm(); C.time = b.dataset.t; C.err = ''; render(); });
  const rt = document.getElementById('retry'); if (rt) rt.onclick = () => { busyFor = null; render(); };

  async function book() {
    keepForm();
    const name = C.name.trim(), phone = C.phone.trim();
    const fail = m => { C.err = m; render(); document.getElementById(m === ERR.TELEFON ? 'cPhone' : 'cName')?.focus(); };
    if (name.split(/\s+/).length < 2) return fail(ERR.ISIM);
    if (digits(phone).length < 10) return fail(ERR.TELEFON);
    const bk = document.getElementById('book'); bk.disabled = true; bk.textContent = 'Kaydediliyor…';
    try {
      const r = await q(() => SB.rpc('b_book', { p_slug: SLUG, p_date: C.date, p_time: C.time, p_service: svc.id, p_name: name, p_phone: phone }), 2);
      C.lookup = phone; C.done = r; C.err = ''; busyFor = null; render(); window.scrollTo(0, 0);
    } catch (e) {
      C.err = errText(e); if ((e.message || '').includes('DOLU')) { C.time = null; busyFor = null; }
      render();
    }
  }
}

function renderMine(seg) {
  const list = C.mine;
  app.innerHTML = head() + seg + `<section class="sec"><h2>Randevularım</h2>
    <label for="lk">Randevu alırken yazdığınız telefon<input id="lk" type="tel" inputmode="tel" autocomplete="off" maxlength="20" value="${esc(C.lookup)}" placeholder="05xx xxx xx xx"></label>
    <button class="btn dark" id="lkB">Göster</button>
    ${list ? `<div class="card"><div class="list">${list.map(a => `<div class="item"><div class="t">${hm(a.start_time)}</div><div class="main"><div><b>${esc(fmtD(a.date))}</b></div><div class="muted">${esc(a.service)}</div>
      <div class="acts"><button class="btn ghost sm" data-cx="${a.id}">İptal et</button></div></div></div>`).join('') || '<p class="empty">Bu numaraya ait yaklaşan randevu yok.</p>'}</div></div>` : ''}</section>`;
  app.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { C.view = b.dataset.v; render(); });
  const load = async () => { C.mine = await q(() => SB.rpc('b_mine', { p_slug: SLUG, p_phone: C.lookup })); };
  document.getElementById('lkB').onclick = async () => {
    C.lookup = document.getElementById('lk').value;
    if (digits(C.lookup).length < 10) { toast('Telefon numarasını tam yazın.'); return; }
    try { await load(); } catch (e) { toast('Bağlantı sorunu, tekrar deneyin.'); }
    render();
  };
  app.querySelectorAll('[data-cx]').forEach(b => b.onclick = async () => {
    if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = 'Emin misiniz? Tekrar dokunun'; return; }
    try { await q(() => SB.rpc('b_cancel', { p_slug: SLUG, p_id: b.dataset.cx, p_phone: C.lookup })); toast('Randevunuz iptal edildi'); await load(); busyFor = null; render(); }
    catch (e) { toast('İptal edilemedi, tekrar deneyin.'); }
  });
}

/* Link olmadan açılırsa tanıtım sayfasına git */
function landing() { location.replace('/tanitim/'); }

init();
