/* Berberim · müşteri randevu sayfası (fiyat bilgisi içermez) */
const ERR = {
  DOLU: 'Bu saat az önce doldu, başka bir saat seçin.',
  ISIM: 'Lütfen adınızı ve soyadınızı yazın.',
  TELEFON: 'Telefon numarası en az 10 haneli olmalı.',
  KAPALI: 'Bu gün dükkan kapalı.',
  SAAT: 'Bu saat çalışma saatlerinin dışında.',
  GECMIS: 'Geçmiş bir saat seçilemez.',
  TARIH: 'En fazla 30 gün sonrası için randevu alınabilir.',
  LIMIT: 'Bu numarayla zaten 3 açık randevu var.',
  HIZMET_YOK: 'Hizmet bulunamadı, sayfayı yenileyin.'
};
const errText = e => { const k = Object.keys(ERR).find(k => (e && e.message || '').includes(k)); return k ? ERR[k] : 'Bağlantı sorunu oldu, lütfen tekrar deneyin.'; };

let SHOP = null, BUSY = [], busyFor = null, loadingSlots = false;
let me = store.get('berberim_me') || {};
const C = { svc: null, date: null, time: null, done: null, view: 'yeni', lookup: '', mine: null, err: '' };

async function init() {
  try {
    const rows = await q(() => SB.from('shop').select('name,open_time,close_time,step,closed_days,services').eq('id', 1));
    SHOP = rows[0];
    SHOP.open_time = hm(SHOP.open_time); SHOP.close_time = hm(SHOP.close_time);
    document.title = SHOP.name + ' · Online Randevu';
    render();
  } catch (e) {
    document.getElementById('app').innerHTML = `<section class="box" style="text-align:center"><h2 style="justify-content:center">Sayfa yüklenemedi</h2><p class="meta" style="margin:0">İnternet bağlantınızı kontrol edip tekrar deneyin.</p><p class="meta" style="margin:0;font-size:11px;opacity:.7">${esc((e && (e.message || e.code)) || '')}</p><button class="btn" onclick="location.reload()">Tekrar dene</button></section>`;
  }
}

async function loadBusy(date) {
  loadingSlots = true; busyFor = date;
  try { const r = await q(() => SB.rpc('busy_slots', { p_date: date })); if (busyFor === date) BUSY = r || []; }
  catch (e) { if (busyFor === date) { BUSY = null; } }
  loadingSlots = false; if (busyFor === date) render();
}

function hero() {
  const s = SHOP;
  return `<header class="hero"><span class="eyebrow">Online randevu</span><h1>${esc(s.name)}</h1>
  <p>Boş saati seç, 30 saniyede randevunu al.</p><div class="tags"><span>${s.open_time} – ${s.close_time}</span><span>${s.closed_days.length ? s.closed_days.map(i => DSH[i]).join(', ') + ' kapalı' : 'Her gün açık'}</span></div></header>`;
}
function keepMe() { const n = document.getElementById('cName'), p = document.getElementById('cPhone'); if (n) me = { name: n.value, phone: p.value }; }

function render() {
  const app = document.getElementById('app'), s = SHOP;
  if (C.done) {
    const a = C.done;
    app.innerHTML = hero() + `<section class="box done"><div class="tick">✓</div><h2 style="justify-content:center">Randevunuz alındı</h2>
      <p style="margin:0">${esc(fmtD(a.date))}, saat <b>${esc(a.time)}</b><br>${esc(a.service)}</p>
      <p class="meta" style="margin:0">${esc(s.name)} sizi bekliyor. Gerekirse bu sayfadaki "Randevularım" bölümünden iptal edebilirsiniz.</p>
      <button class="btn sec" id="again">Yeni randevu al</button></section>`;
    document.getElementById('again').onclick = () => { C.done = null; C.time = null; busyFor = null; render(); };
    return;
  }
  const tabs = `<div class="tabs" role="tablist"><button class="${C.view === 'yeni' ? 'on' : ''}" data-v="yeni">Randevu al</button><button class="${C.view === 'benim' ? 'on' : ''}" data-v="benim">Randevularım</button></div>`;
  if (C.view === 'benim') { renderMine(app, tabs); return; }

  if (!C.svc) C.svc = s.services[0].id;
  const svc = s.services.find(x => x.id === C.svc) || s.services[0];
  const days = []; for (let i = 0; i < 14; i++) { const d = addDays(new Date(), i); days.push({ d, s: ymd(d), closed: s.closed_days.includes(d.getDay()) }); }
  if (!C.date || days.find(x => x.s === C.date)?.closed) C.date = (days.find(x => !x.closed) || days[0]).s;
  if (busyFor !== C.date) { BUSY = []; loadBusy(C.date); }

  let slotHtml;
  if (loadingSlots) slotHtml = '<p class="loading">Boş saatler yükleniyor…</p>';
  else if (BUSY === null) slotHtml = '<p class="empty">Saatler yüklenemedi. <button class="btn sec sm" id="retry">Tekrar dene</button></p>';
  else {
    const slots = freeSlots(s, C.date, svc.dur, BUSY);
    if (C.time && !slots.find(x => x.t === C.time && x.free)) C.time = null;
    const freeN = slots.filter(x => x.free).length;
    slotHtml = `<div class="legend"><span><i style="background:var(--ok-soft);border:1px solid var(--ok)"></i>Boş</span><span><i style="background:var(--line)"></i>Dolu</span><span>${freeN} boş saat</span></div>` +
      (freeN ? `<div class="slots">${slots.map(x => `<button class="slot ${x.free ? '' : 'full'} ${x.t === C.time ? 'on' : ''}" data-t="${x.t}" ${x.free ? '' : 'disabled aria-label="' + x.t + ' dolu"'}>${x.t}</button>`).join('')}</div>` : '<p class="empty">Bu gün dolu, başka bir gün seçin.</p>');
  }

  app.innerHTML = hero() + tabs + `
  <section class="box"><h2><span class="n">1</span>Hizmet</h2><div class="chips">${s.services.map(x => `<button class="chip ${x.id === svc.id ? 'on' : ''}" data-svc="${esc(x.id)}">${esc(x.name)}<small>${x.dur} dk</small></button>`).join('')}</div></section>
  <section class="box"><h2><span class="n">2</span>Gün</h2><div class="chips">${days.map(x => `<button class="chip day ${x.s === C.date ? 'on' : ''}" data-day="${x.s}" ${x.closed ? 'disabled' : ''}><small>${x.s === ymd(new Date()) ? 'Bugün' : DSH[x.d.getDay()]}</small><b>${x.d.getDate()}</b><small>${x.closed ? 'Kapalı' : MONTHS[x.d.getMonth()].slice(0, 3)}</small></button>`).join('')}</div></section>
  <section class="box"><h2><span class="n">3</span>Saat</h2>${slotHtml}</section>
  <section class="box"><h2><span class="n">4</span>Bilgileriniz</h2>
    <label for="cName">Ad soyad<input id="cName" autocomplete="name" maxlength="80" value="${esc(me.name)}" placeholder="Örn. Serhat Tutak"></label>
    <label for="cPhone">Telefon (WhatsApp)<input id="cPhone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" value="${esc(me.phone)}" placeholder="05xx xxx xx xx"></label>
    ${C.time ? `<div class="summary"><b>${esc(fmtD(C.date))}</b>, saat <b>${C.time}</b> · ${esc(svc.name)}</div>` : '<p class="meta" style="margin:0">Önce bir saat seçin.</p>'}
    <p class="err" id="cErr" ${C.err ? '' : 'hidden'}>${esc(C.err)}</p>
    <button class="btn" id="book" ${C.time ? '' : 'disabled'}>Randevuyu onayla</button></section>`;

  app.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { keepMe(); C.view = b.dataset.v; C.err = ''; render(); });
  app.querySelectorAll('[data-svc]').forEach(b => b.onclick = () => { keepMe(); C.svc = b.dataset.svc; C.err = ''; render(); });
  app.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { keepMe(); C.date = b.dataset.day; C.time = null; C.err = ''; render(); });
  app.querySelectorAll('.slot:not(.full)').forEach(b => b.onclick = () => { keepMe(); C.time = b.dataset.t; C.err = ''; render(); document.getElementById('book').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  const rt = document.getElementById('retry'); if (rt) rt.onclick = () => { busyFor = null; render(); };
  const bk = document.getElementById('book');
  bk.onclick = async () => {
    keepMe();
    const name = me.name.trim(), phone = me.phone.trim();
    if (name.split(/\s+/).length < 2) { C.err = ERR.ISIM; render(); return; }
    if (digits(phone).length < 10) { C.err = ERR.TELEFON; render(); return; }
    bk.disabled = true; bk.textContent = 'Kaydediliyor…';
    try {
      const r = await q(() => SB.rpc('book', { p_date: C.date, p_time: C.time, p_service: svc.id, p_name: name, p_phone: phone }), 2);
      store.set('berberim_me', { name, phone });
      C.done = r; C.err = ''; busyFor = null; render(); window.scrollTo(0, 0);
    } catch (e) {
      C.err = errText(e); if ((e.message || '').includes('DOLU')) { C.time = null; busyFor = null; }
      render();
    }
  };
}

async function renderMine(app, tabs) {
  if (!C.lookup && me.phone) C.lookup = me.phone;
  const list = C.mine;
  app.innerHTML = hero() + tabs + `<section class="box mine"><h2>Randevularım</h2>
    <label for="lk">Randevu alırken yazdığınız telefon<input id="lk" type="tel" inputmode="tel" maxlength="20" value="${esc(C.lookup)}" placeholder="05xx xxx xx xx"></label>
    <button class="btn sec" id="lkB">Randevularımı göster</button>
    ${list ? `<div class="list">${list.map(a => `<div class="item"><div class="t">${hm(a.start_time)}</div><div class="main"><div><b>${esc(fmtD(a.date))}</b></div><div class="meta">${esc(a.service)}</div>
      <div class="acts"><button class="btn sec sm" data-cx="${a.id}">İptal et</button></div></div></div>`).join('') || '<p class="empty">Bu numaraya ait yaklaşan randevu yok.</p>'}</div>` : ''}</section>`;
  app.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { C.view = b.dataset.v; render(); });
  document.getElementById('lkB').onclick = async () => {
    C.lookup = document.getElementById('lk').value;
    if (digits(C.lookup).length < 10) { toast('Telefon numarasını tam yazın.'); return; }
    try { C.mine = await q(() => SB.rpc('my_appts', { p_phone: C.lookup })); } catch (e) { toast('Bağlantı sorunu, tekrar deneyin.'); }
    render();
  };
  app.querySelectorAll('[data-cx]').forEach(b => b.onclick = async () => {
    if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = 'Emin misiniz? Tekrar dokunun'; return; }
    try { await q(() => SB.rpc('cancel_appt', { p_id: b.dataset.cx, p_phone: C.lookup })); toast('Randevunuz iptal edildi.');
      C.mine = await q(() => SB.rpc('my_appts', { p_phone: C.lookup })); busyFor = null; render();
    } catch (e) { toast('İptal edilemedi, tekrar deneyin.'); }
  });
}

init();
