/* Berberim · berber paneli (sadece yönetici hesabı veri görebilir) */
let SHOP = null, FEE = 500;
const P = { tab: 'gun', date: ymd(new Date()), month: ymd(new Date()).slice(0, 7), q: '', adding: false, edit: null, cmdMsg: null, authMode: 'giris' };
const DATA = { day: [], week: [], all: null, monthAppts: [], expenses: [] };
const app = () => document.getElementById('app');
const pill = s => ({ bekliyor: '<span class="pill p-wait">Bekliyor</span>', geldi: '<span class="pill p-ok">Geldi</span>', gelmedi: '<span class="pill p-no">Gelmedi</span>', iptal: '<span class="pill p-warn">İptal</span>' }[s]);
const header = () => `<header class="hero"><span class="eyebrow">Berber paneli</span><h1>${esc(SHOP ? SHOP.name : 'Berberim')}</h1></header>`;
function failBox(msg, e) { app().innerHTML = header() + `<section class="box" style="text-align:center"><p style="margin:0">${esc(msg)}</p><p class="meta" style="margin:0;font-size:11px;opacity:.7">${esc((e && (e.message || e.code)) || '')}</p><button class="btn" onclick="location.reload()">Tekrar dene</button></section>`; }

/* ---------- Giriş ---------- */
async function boot() {
  try {
    const { data } = await SB.auth.getSession();
    if (!data.session) return renderLogin();
    const ok = await q(() => SB.rpc('claim_admin'));
    if (!ok) { app().innerHTML = header() + `<section class="box"><h2>Yetki yok</h2><p class="meta" style="margin:0">Bu hesap berber hesabı değil.</p><button class="btn sec" id="lo">Çıkış yap</button></section>`; document.getElementById('lo').onclick = logout; return; }
    await loadShop();
    await refresh();
    setInterval(() => { if (!document.hidden && !P.adding && P.edit === null && P.tab === 'gun') refresh(true); }, 60000);
  } catch (e) { failBox('Bağlantı kurulamadı. İnternetinizi kontrol edin.', e); }
}
async function logout() { await SB.auth.signOut(); location.reload(); }
function renderLogin(msg) {
  const reg = P.authMode === 'kayit';
  app().innerHTML = header() + `<section class="box"><h2>${reg ? 'Berber hesabı oluştur' : 'Giriş yap'}</h2>
    <label for="em">E-posta<input id="em" type="email" autocomplete="email"></label>
    <label for="pw">Şifre<input id="pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="8"></label>
    <p class="err" id="aErr" ${msg ? '' : 'hidden'}>${esc(msg || '')}</p>
    <button class="btn" id="go">${reg ? 'Hesap oluştur' : 'Giriş yap'}</button>
    <button class="btn sec sm" id="sw">${reg ? 'Hesabım var, giriş yap' : 'İlk kurulum: berber hesabı oluştur'}</button>
    <p class="meta" style="margin:0">${reg ? 'İlk oluşturulan hesap berber hesabı olur. Sonradan kimse başka yönetici hesabı açamaz.' : 'Bu sayfa sadece berber içindir.'}</p></section>`;
  document.getElementById('sw').onclick = () => { P.authMode = reg ? 'giris' : 'kayit'; renderLogin(); };
  const go = async () => {
    const email = document.getElementById('em').value.trim(), password = document.getElementById('pw').value;
    if (!email || password.length < 8) return renderLogin('E-posta ve en az 8 karakterli şifre girin.');
    const b = document.getElementById('go'); b.disabled = true; b.textContent = 'Bekleyin…';
    try {
      if (reg) {
        const { data, error } = await SB.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + '/panel/' } });
        if (error) throw error;
        if (!data.session) { P.authMode = 'giris'; return renderLogin('Hesap oluşturuldu. E-postana gelen onay linkine dokun, sonra buradan giriş yap.'); }
      } else {
        const { error } = await SB.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      boot();
    } catch (e) {
      const m = e.message || '';
      renderLogin(/invalid login/i.test(m) ? 'E-posta veya şifre yanlış.' : /not confirmed/i.test(m) ? 'Önce e-postana gelen onay linkine dokun.' : /already registered/i.test(m) ? 'Bu e-posta zaten kayıtlı, giriş yapın.' : 'İşlem yapılamadı: ' + m);
    }
  };
  document.getElementById('go').onclick = go;
  document.getElementById('pw').onkeydown = e => { if (e.key === 'Enter') go(); };
}

/* ---------- Veri ---------- */
async function loadShop() {
  const [s, p] = await Promise.all([q(() => SB.from('shop').select('*').eq('id', 1)), q(() => SB.from('shop_private').select('fee').eq('id', 1))]);
  SHOP = s[0]; SHOP.open_time = hm(SHOP.open_time); SHOP.close_time = hm(SHOP.close_time); FEE = p[0] ? p[0].fee : 500;
}
async function refresh(silent) {
  try {
    if (P.tab === 'gun') {
      const from = ymd(addDays(new Date(), -6));
      const [day, week] = await Promise.all([
        q(() => SB.from('appointments').select('*').eq('date', P.date).order('time')),
        q(() => SB.from('appointments').select('date,status').gte('date', from).lte('date', ymd(new Date())).eq('status', 'geldi'))
      ]);
      DATA.day = day; DATA.week = week;
    } else if (P.tab === 'musteri') {
      DATA.all = await q(() => SB.from('appointments').select('name,phone,status,price,date').order('date', { ascending: false }).limit(20000));
    } else if (P.tab === 'para') {
      const [y, m] = P.month.split('-').map(Number), start = P.month + '-01', end = ymd(new Date(y, m, 0));
      const [ap, ex] = await Promise.all([
        q(() => SB.from('appointments').select('service,price').eq('status', 'geldi').gte('date', start).lte('date', end)),
        q(() => SB.from('expenses').select('*').gte('date', start).lte('date', end).order('date', { ascending: false }))
      ]);
      DATA.monthAppts = ap; DATA.expenses = ex;
    }
    render();
  } catch (e) {
    if (e && /JWT|auth/i.test(e.message || '')) return renderLogin('Oturum süresi doldu, tekrar giriş yapın.');
    if (!silent) toast('Veriler yüklenemedi, tekrar deneyin.');
  }
}
async function mutate(fn, okMsg) {
  try { await q(fn, 2); if (okMsg) toast(okMsg); await refresh(true); return true; }
  catch (e) { toast('Kaydedilemedi, tekrar deneyin.'); return false; }
}

/* ---------- Görünüm ---------- */
function render() {
  const tabs = [['gun', 'Randevular'], ['musteri', 'Müşteriler'], ['para', 'Gelir–Gider'], ['ayar', 'Ayarlar']];
  app().innerHTML = header() + `<div class="tabs" role="tablist">${tabs.map(([k, v]) => `<button role="tab" class="${P.tab === k ? 'on' : ''}" data-tab="${k}">${v}</button>`).join('')}</div><div id="tab" style="display:flex;flex-direction:column;gap:12px"></div>`;
  app().querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { P.tab = b.dataset.tab; P.edit = null; P.adding = false; if (P.tab === 'ayar') render(); else { document.getElementById('tab').innerHTML = '<p class="loading">Yükleniyor…</p>'; refresh(); } });
  ({ gun: tabDay, musteri: tabCust, para: tabMoney, ayar: tabSettings })[P.tab](document.getElementById('tab'));
}

function weekBars() {
  const t = new Date(), arr = [];
  for (let i = 6; i >= 0; i--) { const d = addDays(t, -i), s = ymd(d); arr.push({ lbl: i === 0 ? 'Bugün' : DSH[d.getDay()], n: DATA.week.filter(a => a.date === s).length, today: i === 0 }); }
  const mx = Math.max(1, ...arr.map(x => x.n));
  return `<section class="box"><div class="navd"><h2>Son 7 gün</h2><span class="meta">${arr.reduce((s, x) => s + x.n, 0)} müşteri geldi</span></div>
  <div class="bars" role="img" aria-label="Son 7 günde gelen müşteri sayısı">${arr.map(x => `<div class="bar ${x.today ? 'today' : ''}"><b>${x.n}</b><i style="height:${Math.max(4, x.n / mx * 80)}px"></i><span>${x.lbl}</span></div>`).join('')}</div></section>`;
}
const remindText = a => `Merhaba ${a.name.split(' ')[0]}, ${SHOP.name} randevunuzu hatırlatırız: ${fmtD(a.date)}, saat ${hm(a.time)} (${a.service}). Görüşmek üzere ✂️`;

function tabDay(el) {
  const list = DATA.day, came = list.filter(a => a.status === 'geldi'), inc = came.reduce((s, a) => s + a.price, 0), sv = SHOP.services;
  const nowHM = toHM(Math.round((new Date().getHours() * 60 + new Date().getMinutes()) / 15) * 15 % 1440);
  el.innerHTML = cmdBox() + `
  <div class="navd"><button class="btn sec sm" id="pv">‹ Önceki</button><b style="text-align:center">${esc(fmtD(P.date))}${P.date === ymd(new Date()) ? '<br><span class="meta">Bugün</span>' : ''}</b><button class="btn sec sm" id="nx">Sonraki ›</button></div>
  <div class="stats"><div class="stat"><b>${list.filter(a => a.status !== 'iptal').length}</b><span>Randevu</span></div><div class="stat"><b>${came.length}</b><span>Gelen müşteri</span></div><div class="stat"><b class="money">${tl(inc)}</b><span>Günün geliri</span></div></div>
  <section class="box"><div class="navd"><h2>Randevular</h2><button class="btn sm" id="addT">${P.adding ? 'Kapat' : '+ Kapıdan gelen'}</button></div>
  ${P.adding ? `<div class="summary" style="display:flex;flex-direction:column;gap:8px">
    <div class="row"><label for="wN">Ad soyad<input id="wN" maxlength="80"></label><label for="wP">Telefon<input id="wP" type="tel" inputmode="tel" maxlength="20"></label></div>
    <div class="row"><label for="wS">Hizmet<select id="wS">${sv.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
    <label for="wF">Ücret (₺)<input id="wF" type="number" inputmode="numeric" value="${FEE}"></label>
    <label for="wT">Saat<input id="wT" type="time" value="${nowHM}"></label></div>
    <button class="btn ok" id="wSave">Müşteriyi kaydet (geldi)</button></div>` : ''}
  <div class="list">${list.map(a => `<div class="item"><div class="t">${hm(a.time)}</div><div class="main">
    <div><b>${esc(a.name)}</b> ${pill(a.status)}</div><div class="meta">${esc(a.service)} · ${a.dur} dk · ${esc(a.phone || '—')}</div>
    <div class="acts">${P.edit === a.id ? `<input id="pe" type="number" inputmode="numeric" value="${a.price}" style="width:100px;padding:6px" aria-label="Ücret"><button class="btn ok sm" id="peS">Kaydet</button>` : `<button class="btn sec sm money" data-pe="${a.id}">${tl(a.price)} ✎</button>`}</div>
    <div class="acts">${a.status !== 'geldi' ? `<button class="btn ok sm" data-st="geldi" data-id="${a.id}">Geldi</button>` : ''}${a.status === 'bekliyor' ? `<button class="btn sec sm" data-st="gelmedi" data-id="${a.id}">Gelmedi</button><button class="btn sec sm" data-st="iptal" data-id="${a.id}">İptal</button>${a.phone ? `<a class="btn sec sm" target="_blank" rel="noopener" href="https://wa.me/${waNum(a.phone)}?text=${encodeURIComponent(remindText(a))}">Hatırlat</a>` : ''}` : `<button class="btn sec sm" data-st="bekliyor" data-id="${a.id}">Geri al</button>`}</div>
  </div></div>`).join('') || '<p class="empty">Bu gün için randevu yok.</p>'}</div></section>` + weekBars();
  el.querySelector('#pv').onclick = () => { P.date = ymd(addDays(parseD(P.date), -1)); refresh(); };
  el.querySelector('#nx').onclick = () => { P.date = ymd(addDays(parseD(P.date), 1)); refresh(); };
  el.querySelector('#addT').onclick = () => { P.adding = !P.adding; render(); };
  if (P.adding) el.querySelector('#wSave').onclick = async () => {
    const n = el.querySelector('#wN').value.trim(), p = el.querySelector('#wP').value.trim(), s = sv.find(x => x.id === el.querySelector('#wS').value), t = el.querySelector('#wT').value;
    if (n.length < 2 || !t) { toast('İsim ve saat girin.'); return; }
    if (await mutate(() => SB.from('appointments').insert({ date: P.date, time: t, dur: s.dur, service: s.name, price: Math.max(0, Number(el.querySelector('#wF').value) || FEE), name: n, phone: p, status: 'geldi', source: 'panel' }), 'Kaydedildi')) P.adding = false;
  };
  el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => mutate(() => SB.from('appointments').update({ status: b.dataset.st }).eq('id', b.dataset.id)));
  el.querySelectorAll('[data-pe]').forEach(b => b.onclick = () => { P.edit = b.dataset.pe; render(); const i = document.getElementById('pe'); i.focus(); i.select(); });
  const peS = el.querySelector('#peS');
  if (peS) { const done = async () => { const id = P.edit, v = Math.max(0, Number(el.querySelector('#pe').value) || 0); P.edit = null; await mutate(() => SB.from('appointments').update({ price: v }).eq('id', id), 'Ücret kaydedildi'); }; peS.onclick = done; el.querySelector('#pe').onkeydown = e => { if (e.key === 'Enter') done(); }; }
  bindCmd(el);
}

function tabCust(el) {
  const map = {}, today = new Date();
  (DATA.all || []).forEach(a => {
    const k = digits(a.phone) || a.name.toLocaleLowerCase('tr');
    const c = map[k] || (map[k] = { name: a.name, phone: a.phone, visits: 0, no: 0, spent: 0, last: null });
    if (a.status === 'geldi') { c.visits++; c.spent += a.price; if (!c.last || a.date > c.last) c.last = a.date; }
    if (a.status === 'gelmedi') c.no++;
  });
  let arr = Object.values(map).sort((a, b) => b.visits - a.visits);
  const total = arr.length, ql = P.q.toLocaleLowerCase('tr');
  if (ql) arr = arr.filter(c => c.name.toLocaleLowerCase('tr').includes(ql) || (c.phone || '').includes(ql));
  el.innerHTML = `<div class="navd"><span class="meta">Toplam ${total} müşteri</span></div>
  <input id="q" placeholder="İsim veya telefon ara" value="${esc(P.q)}" aria-label="Müşteri ara">
  <section class="box"><div class="list">${arr.slice(0, 300).map(c => {
    const days = c.last ? Math.round((today - parseD(c.last)) / 864e5) : null;
    return `<div class="item"><div class="main"><div><b>${esc(c.name)}</b> ${c.visits >= 5 ? '<span class="pill p-ok">Sadık müşteri</span>' : ''} ${days !== null && days >= 30 ? '<span class="pill p-warn">' + days + ' gündür gelmedi</span>' : ''} ${c.no >= 2 ? '<span class="pill p-no">' + c.no + ' kez gelmedi</span>' : ''}</div>
    <div class="meta">${esc(c.phone || '—')} · ${c.visits} ziyaret · son: ${c.last ? esc(fmtD(c.last)) : '—'}</div>
    ${c.phone && days !== null && days >= 30 ? `<div class="acts"><a class="btn sec sm" target="_blank" rel="noopener" href="https://wa.me/${waNum(c.phone)}?text=${encodeURIComponent('Merhaba ' + c.name.split(' ')[0] + ', ' + SHOP.name + ' olarak sizi özledik! Randevu almak ister misiniz? ✂️')}">WhatsApp'tan davet et</a></div>` : ''}</div>
    <div class="money"><b>${tl(c.spent)}</b></div></div>`;
  }).join('') || '<p class="empty">Henüz müşteri yok.</p>'}</div></section>`;
  const qi = el.querySelector('#q'); qi.oninput = () => { P.q = qi.value; tabCust(el); const n = el.querySelector('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
}

function tabMoney(el) {
  const [y, mo] = P.month.split('-').map(Number), ap = DATA.monthAppts, ex = DATA.expenses;
  const inc = ap.reduce((s, a) => s + a.price, 0), exp = ex.reduce((s, e) => s + Number(e.amount), 0), net = inc - exp;
  const bySvc = {}; ap.forEach(a => { bySvc[a.service] = (bySvc[a.service] || 0) + a.price; });
  const shift = n => { const d = new Date(y, mo - 1 + n, 1); P.month = d.getFullYear() + '-' + pad(d.getMonth() + 1); refresh(); };
  el.innerHTML = `
  <div class="navd"><button class="btn sec sm" id="pm">‹ Önceki</button><b>${MONTHS[mo - 1]} ${y}</b><button class="btn sec sm" id="nm">Sonraki ›</button></div>
  <div class="stats"><div class="stat"><b class="money" style="color:var(--ok)">${tl(inc)}</b><span>Gelir · ${ap.length} müşteri</span></div><div class="stat"><b class="money" style="color:var(--red)">${tl(exp)}</b><span>Gider</span></div><div class="stat"><b class="money" style="color:${net < 0 ? 'var(--red)' : 'var(--fg)'}">${tl(net)}</b><span>Net kâr</span></div></div>
  ${inc ? `<section class="box"><h2>Gelir hangi hizmetten?</h2><div class="list">${Object.entries(bySvc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="item"><div class="main">${esc(k)}<div style="height:6px;border-radius:3px;background:var(--blue-soft);margin-top:6px"><div style="height:6px;border-radius:3px;background:var(--blue);width:${Math.round(v / inc * 100)}%"></div></div></div><div class="money"><b>${tl(v)}</b></div></div>`).join('')}</div></section>` : ''}
  <section class="box"><h2>Gider ekle</h2>
    <div class="row"><label for="eD">Açıklama<input id="eD" maxlength="120" placeholder="Örn. Kira, malzeme"></label><label for="eA">Tutar (₺)<input id="eA" type="number" inputmode="decimal" min="0"></label></div>
    <label for="eT">Tarih<input id="eT" type="date" value="${P.month === ymd(new Date()).slice(0, 7) ? ymd(new Date()) : P.month + '-01'}"></label>
    <button class="btn" id="eAdd">Gideri kaydet</button></section>
  <section class="box"><h2>Bu ayın giderleri</h2><div class="list">${ex.map(e => `<div class="item"><div class="main"><div>${esc(e.descr)}</div><div class="meta">${esc(fmtD(e.date))}</div></div><div class="money">${tl(e.amount)}</div><button class="btn sec sm" data-del="${e.id}">Sil</button></div>`).join('') || '<p class="empty">Bu ay gider girilmemiş.</p>'}</div></section>`;
  el.querySelector('#pm').onclick = () => shift(-1); el.querySelector('#nm').onclick = () => shift(1);
  el.querySelector('#eAdd').onclick = () => {
    const d = el.querySelector('#eD').value.trim(), a = Number(el.querySelector('#eA').value), t = el.querySelector('#eT').value;
    if (!d || !(a > 0) || !t) { toast('Açıklama, tutar ve tarih girin.'); return; }
    mutate(() => SB.from('expenses').insert({ date: t, descr: d, amount: a }), 'Gider kaydedildi');
  };
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = 'Emin misin?'; return; } mutate(() => SB.from('expenses').delete().eq('id', b.dataset.del), 'Silindi'); });
}

function tabSettings(el) {
  const st = SHOP, link = location.origin + '/';
  const msg = () => document.getElementById('sM').value.replace(/\{isim\}/g, st.name).replace(/\{link\}/g, link);
  el.innerHTML = `
  <section class="box"><h2>Müşteri linki</h2><div class="summary" style="overflow-wrap:anywhere">${esc(link)}</div><button class="btn sec" id="cpL">Linki kopyala</button></section>
  <section class="box"><h2>Dükkan</h2>
    <label for="sN">Berber adı<input id="sN" maxlength="60" value="${esc(st.name)}"></label>
    <div class="row"><label for="sO">Açılış<input id="sO" type="time" value="${st.open_time}"></label><label for="sC">Kapanış<input id="sC" type="time" value="${st.close_time}"></label>
    <label for="sS">Randevu aralığı<select id="sS"><option value="30" ${st.step == 30 ? 'selected' : ''}>30 dakika</option><option value="45" ${st.step == 45 ? 'selected' : ''}>45 dakika</option></select></label></div>
    <div><span class="eyebrow" style="color:var(--muted)">Kapalı günler</span><div class="closed">${DSH.map((d, i) => `<label for="cd${i}"><input type="checkbox" id="cd${i}" data-cd="${i}" ${st.closed_days.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div></div>
    <label for="sF">Varsayılan ücret (₺) · müşteri görmez<input id="sF" type="number" inputmode="numeric" value="${FEE}"></label></section>
  <section class="box"><h2>Hizmetler</h2><div class="svc meta"><span>Hizmet</span><span>Süre (dk)</span></div>
    ${st.services.map((s, i) => `<div class="svc"><input id="vn${i}" maxlength="40" value="${esc(s.name)}" aria-label="Hizmet adı"><input id="vd${i}" type="number" min="15" step="15" value="${s.dur}" aria-label="Süre"></div>`).join('')}</section>
  <section class="box"><h2>WhatsApp karşılama mesajı</h2>
    <p class="meta" style="margin:0">WhatsApp Business → Araçlar → Karşılama mesajı bölümüne yapıştırın.</p>
    <label for="sM">Mesaj metni<textarea id="sM">${esc(st.msg)}</textarea></label>
    <div class="summary" id="prev" style="white-space:pre-wrap;overflow-wrap:anywhere"></div>
    <button class="btn sec" id="cp">Mesajı kopyala</button></section>
  <button class="btn" id="sv">Ayarları kaydet</button>
  <button class="btn sec" id="lo">Çıkış yap</button>`;
  const prev = el.querySelector('#prev'); prev.textContent = msg();
  el.querySelector('#sM').oninput = () => { prev.textContent = msg(); };
  const copy = (text, b) => navigator.clipboard.writeText(text).then(() => toast('Kopyalandı')).catch(() => toast('Kopyalanamadı, metni elle seçin.'));
  el.querySelector('#cp').onclick = e => copy(msg(), e.target);
  el.querySelector('#cpL').onclick = e => copy(link, e.target);
  el.querySelector('#lo').onclick = logout;
  el.querySelector('#sv').onclick = async () => {
    const upd = {
      name: el.querySelector('#sN').value.trim() || st.name, open_time: el.querySelector('#sO').value, close_time: el.querySelector('#sC').value,
      step: Number(el.querySelector('#sS').value), closed_days: [...el.querySelectorAll('[data-cd]')].filter(c => c.checked).map(c => Number(c.dataset.cd)),
      services: st.services.map((s, i) => ({ id: s.id, name: el.querySelector('#vn' + i).value.trim() || s.name, dur: Math.max(15, Number(el.querySelector('#vd' + i).value) || s.dur) })),
      msg: el.querySelector('#sM').value
    };
    if (toMin(upd.close_time) <= toMin(upd.open_time)) { toast('Kapanış saati açılıştan sonra olmalı.'); return; }
    const fee = Math.max(0, Number(el.querySelector('#sF').value) || FEE);
    try {
      await q(() => SB.from('shop').update(upd).eq('id', 1), 2);
      await q(() => SB.from('shop_private').update({ fee }).eq('id', 1), 2);
      await loadShop(); toast('Ayarlar kaydedildi'); render();
    } catch (e) { toast('Kaydedilemedi, tekrar deneyin.'); }
  };
}

/* ---------- Sesli / yazılı komut ---------- */
const NUMW = { 'bir': 1, 'iki': 2, 'üç': 3, 'dört': 4, 'beş': 5, 'altı': 6, 'yedi': 7, 'sekiz': 8, 'dokuz': 9, 'on': 10, 'on bir': 11, 'on iki': 12, 'on üç': 13, 'on dört': 14, 'on beş': 15, 'on altı': 16, 'on yedi': 17, 'on sekiz': 18, 'on dokuz': 19, 'yirmi': 20 };
function parseCmd(raw) {
  let t = ' ' + raw.toLocaleLowerCase('tr').replace(/[,!?]/g, ' ') + ' ';
  Object.keys(NUMW).sort((a, b) => b.length - a.length).forEach(w => { t = t.replace(new RegExp('(^|\\s)' + w + '(?=\\s|\\u0027|da|de|ta|te|buçuk)', 'g'), '$1' + NUMW[w]); });
  t = t.replace(/(\d+)\s*buçuk/g, '$1:30').replace(/(\d+)\s*otuz/g, '$1:30').replace(/(\d+)\s*kırk beş/g, '$1:45').replace(/(\d+)\s*on beş(?!\d)/g, '$1:15');
  let price = null; t = t.replace(/(\d+)\s*(tl|lira|₺)/, (m, n) => { price = Number(n); return ' '; });
  t = t.replace(/(ücret|ücreti|para|aldım|ödedi|verdi)\s*(\d+)/, (m, w, n) => { price = Number(n); return ' '; });
  let time = null;
  const m = t.match(/(?:saat\s*)?(\d{1,2})(?:[:.\s](\d{2}))?\s*(?:'?\s*(?:da|de|ta|te|ya|ye|a|e))?(?=\s)/);
  if (m && Number(m[1]) <= 23) { let h = Number(m[1]); if (h >= 1 && h <= 7) h += 12; time = pad(h) + ':' + pad(Number(m[2] || 0)); t = t.replace(m[0], ' '); }
  if (!time) { const n = new Date(); time = pad(n.getHours()) + ':' + pad(Math.floor(n.getMinutes() / 15) * 15); }
  let status = 'geldi'; if (/gelmedi|gelmeyecek/.test(t)) status = 'gelmedi'; else if (/iptal/.test(t)) status = 'iptal';
  const sv = SHOP.services; let service = null;
  if (/saç/.test(t) && /sakal/.test(t)) service = sv.find(x => /sakal/i.test(x.name) && /saç/i.test(x.name)); else if (/sakal/.test(t)) service = sv.find(x => /^sakal/i.test(x.name)); else if (/saç/.test(t)) service = sv.find(x => /^saç/i.test(x.name));
  const stop = /^(saat|saatte|da|de|ta|te|müşteri|müşterisi|geldi|gelmedi|gelmeyecek|iptal|olarak|için|ve|ile|kişi|bey|hanım|abi|randevu|randevusu|randevulu|saç|saçı|sakal|sakalı|kesimi|traş|tıraş|şimdi|şu|an|bir|yeni|kayıt|ekle|oldu|etti|tamam|ücret|lira|tl|'?da|'?de|'?ta|'?te)$/;
  const name = t.split(/\s+/).filter(w => w && !/\d/.test(w) && !stop.test(w)).map(w => w.charAt(0).toLocaleUpperCase('tr') + w.slice(1)).join(' ');
  return { time, price, status, service, name };
}
async function runCmd(text) {
  const c = parseCmd(text), list = DATA.day.filter(a => a.status !== 'iptal'), nm = c.name.toLocaleLowerCase('tr');
  let a = list.find(x => hm(x.time) === c.time) || (nm ? list.find(x => x.name.toLocaleLowerCase('tr').includes(nm.split(' ')[0])) : null);
  try {
    if (a) {
      const upd = { status: c.status }; if (c.price != null) upd.price = c.price; if (c.service) { upd.service = c.service.name; upd.dur = c.service.dur; }
      await q(() => SB.from('appointments').update(upd).eq('id', a.id), 2);
      P.cmdMsg = { ok: `${hm(a.time)} · ${a.name} · ${{ geldi: 'geldi', gelmedi: 'gelmedi', iptal: 'iptal edildi' }[c.status]}${c.status === 'geldi' ? ' · ' + tl(c.price ?? a.price) : ''}`, undo: { id: a.id, prev: { status: a.status, price: a.price, service: a.service, dur: a.dur } } };
    } else {
      if (c.status !== 'geldi') { P.cmdMsg = { err: 'Bu saatte veya bu isimde randevu bulunamadı.' }; render(); return; }
      const sv = c.service || SHOP.services[0];
      const row = { date: P.date, time: c.time, dur: sv.dur, service: sv.name, price: c.price ?? FEE, name: c.name.length >= 2 ? c.name : 'Kapıdan gelen müşteri', phone: '', status: 'geldi', source: 'panel' };
      const ins = await q(() => SB.from('appointments').insert(row).select('id'), 2);
      P.cmdMsg = { ok: `${row.time} · ${row.name} · geldi · ${tl(row.price)} (yeni kayıt)`, undo: { id: ins[0].id, del: true } };
    }
  } catch (e) { P.cmdMsg = { err: 'Kaydedilemedi, tekrar deneyin.' }; }
  await refresh(true);
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
function cmdBox() {
  const m = P.cmdMsg || {};
  return `<section class="box cmd"><div class="navd"><h2>Hızlı komut</h2>${SR ? `<button class="btn sm mic ${listening ? 'rec' : ''}" id="mic">${listening ? '■ Dinliyorum' : '🎤 Konuş'}</button>` : ''}</div>
  <div class="row" style="flex-wrap:nowrap"><input id="cmd" placeholder="Örn: saat 3'te Ahmet Yılmaz geldi 600 lira" aria-label="Komut" style="min-width:0"><button class="btn ok" id="cmdGo" style="flex:0 0 auto;min-width:0">Uygula</button></div>
  <p class="meta" style="margin:0">${SR ? 'Mikrofona bas ve söyle. ' : 'Klavyedeki mikrofon tuşuyla da söyleyebilirsin. '}Ücret söylemezsen ${tl(FEE)} yazılır.</p>
  ${m.ok ? `<div class="summary" style="background:var(--ok-soft);color:var(--ok)">✓ ${esc(m.ok)} ${m.undo ? '<button class="btn sec sm" id="undo">Geri al</button>' : ''}</div>` : ''}${m.err ? `<p class="err">${esc(m.err)}</p>` : ''}</section>`;
}
function bindCmd(el) {
  const inp = el.querySelector('#cmd'), go = () => { if (inp.value.trim()) { const v = inp.value.trim(); inp.value = ''; runCmd(v); } };
  el.querySelector('#cmdGo').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
  const u = el.querySelector('#undo');
  if (u) u.onclick = async () => { const x = P.cmdMsg.undo; P.cmdMsg = null; await mutate(() => x.del ? SB.from('appointments').delete().eq('id', x.id) : SB.from('appointments').update(x.prev).eq('id', x.id), 'Geri alındı'); };
  const mic = el.querySelector('#mic');
  if (mic) mic.onclick = () => {
    if (listening && rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'tr-TR'; rec.interimResults = true; rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript; } const i2 = document.getElementById('cmd'); if (i2) i2.value = finalText + interim; };
    rec.onerror = e => { listening = false; P.cmdMsg = { err: e.error === 'not-allowed' ? 'Mikrofon izni verilmedi; tarayıcı ayarlarından izin ver veya komutu yaz.' : 'Ses anlaşılamadı, tekrar dene.' }; render(); };
    rec.onend = () => { const was = listening; listening = false; const i2 = document.getElementById('cmd'); const v = (i2 && i2.value.trim()) || finalText.trim(); if (was && v) runCmd(v); else render(); };
    try { rec.start(); listening = true; render(); } catch (e) { listening = false; }
  };
}

boot();
