/* Berberim · berber paneli
   Hız için: her ekran önce telefondaki son kopyadan anında çizilir, internetten gelen yeni veri arkadan güncellenir.
   Dokunuşlar (Geldi, ücret, gider…) ekranda hemen işlenir, kayıt arkada yapılır; hata olursa geri alınır. */
let SHOP = null, SHOPS = [], IS_SUPER = false;
const P = { tab: 'gun', date: ymd(new Date()), month: ymd(new Date()).slice(0, 7), q: '', adding: false, edit: null, cmdMsg: null, svcOpen: false };
const DATA = { day: null, cust: null, money: null };
const app = document.getElementById('app'), tabbar = document.getElementById('tabbar');
const pill = s => ({ bekliyor: '<span class="pill p-wait">Bekliyor</span>', geldi: '<span class="pill p-ok">Geldi</span>', gelmedi: '<span class="pill p-no">Gelmedi</span>', iptal: '<span class="pill p-warn">İptal</span>' }[s]);
const isOpen = s => s.active && daysUntil(s.paid_until) >= 0;
const ck = (...k) => 'bc:' + SHOP.id + ':' + k.join(':');
const busy = () => { const a = document.activeElement; return listening || P.adding || P.edit !== null || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && app.contains(a)); };
const sortDay = () => DATA.day && DATA.day.sort((a, b) => String(a.time).localeCompare(String(b.time)));

/* ---------- Açılış ---------- */
async function boot() {
  const { data } = await SB.auth.getSession();
  if (!data.session) return renderLogin();
  // Önce son bilinen dükkanla hemen aç
  const cached = store.get('bc:shops');
  if (cached && cached.shops && cached.shops.length) { applyShops(cached.shops, cached.sup); if (SHOP && isOpen(SHOP)) show('gun'); }
  try {
    const [shops, sup] = await Promise.all([q(() => SB.from('shops').select('*').order('name')), q(() => SB.rpc('is_super')).catch(() => false)]);
    store.set('bc:shops', { shops, sup: !!sup });
    const wasShown = !!(cached && SHOP);
    applyShops(shops || [], !!sup);
    if (!SHOPS.length) return renderNoShop();
    if (!isOpen(SHOP)) return renderLocked();
    if (!wasShown) show('gun'); else if (P.tab === 'ayar' && !busy()) render();
  } catch (e) {
    if (!SHOP) { tabbar.hidden = true; app.innerHTML = `<header class="head"><h1>Bağlantı kurulamadı</h1><p>İnternetini kontrol edip tekrar dene.</p></header><button class="btn dark" onclick="location.reload()">Tekrar dene</button>`; }
    else toast('İnternet yok gibi; son kayıtlı bilgiler gösteriliyor.');
  }
  setInterval(() => { if (!document.hidden && !busy()) load(true); }, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && SHOP && !busy()) load(true); });
}
function applyShops(shops, sup) {
  SHOPS = shops; IS_SUPER = sup;
  const remembered = store.get('berberim_shop');
  SHOP = SHOPS.find(s => s.id === remembered) || SHOPS[0] || null;
}
async function logout() { try { localStorage.clear(); } catch (e) {} await SB.auth.signOut(); location.reload(); }
function renderNoShop() {
  tabbar.hidden = true;
  app.innerHTML = `<header class="head"><h1>Dükkan bulunamadı</h1><p>Bu hesaba bağlı bir dükkan yok.</p></header>
    ${IS_SUPER ? '<a class="btn" href="/patron/">Patron paneline git</a>' : ''}<button class="btn ghost" id="lo">Çıkış yap</button>`;
  document.getElementById('lo').onclick = logout;
}

function renderLogin(msg) {
  tabbar.hidden = true;
  app.innerHTML = `<header class="head"><h1>Berber girişi</h1><p>Kullanıcı adını ve şifreni Berberim verdi.</p><div class="pole" aria-hidden="true"></div></header>
  <section class="sec">
    <label for="em">Kullanıcı adı<input id="em" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
    <label for="pw">Şifre<input id="pw" type="password" autocomplete="current-password"></label>
    ${msg ? `<p class="err" role="alert">${esc(msg)}</p>` : ''}
    <button class="btn" id="go">Giriş yap</button>
    <p class="muted small">Şifreni unuttuysan Berberim'e yaz, yenisini verelim.</p>
  </section>`;
  const go = async () => {
    const login = document.getElementById('em').value.trim().toLowerCase(), email = login.includes('@') ? login : login + '@uye.berberim.app', password = document.getElementById('pw').value;
    if (!login || !password) return renderLogin('Kullanıcı adını ve şifreni yaz.');
    const b = document.getElementById('go'); b.disabled = true; b.textContent = 'Giriş yapılıyor…';
    const { error } = await SB.auth.signInWithPassword({ email, password });
    if (error) return renderLogin(/invalid/i.test(error.message) ? 'Kullanıcı adı veya şifre yanlış.' : 'Giriş yapılamadı, internetini kontrol et.');
    boot();
  };
  document.getElementById('go').onclick = go;
  document.getElementById('pw').onkeydown = e => { if (e.key === 'Enter') go(); };
}

async function renderLocked() {
  tabbar.hidden = true;
  let seller = null; try { seller = await q(() => SB.rpc('seller_info')); } catch (e) {}
  const expired = daysUntil(SHOP.paid_until) < 0;
  app.innerHTML = `<header class="head"><h1>${esc(SHOP.name)}</h1><div class="pole" aria-hidden="true"></div></header>
  <div class="card lock"><h2>${expired ? 'Aboneliğin sona erdi' : 'Hesabın durduruldu'}</h2>
    <p class="muted">${expired ? `Aboneliğin ${esc(fmtDs(SHOP.paid_until))} tarihinde bitti. ` : ''}Verilerin silinmedi; yenileme yapılınca her şey kaldığı yerden açılır. Bu sürede müşterilerin online randevu alamaz.</p>
    ${seller && seller.phone ? `<a class="btn" href="https://wa.me/${waNum(seller.phone)}?text=${encodeURIComponent(SHOP.name + ' için Berberim aboneliğimi yenilemek istiyorum.')}" target="_blank" rel="noopener">Yenilemek için yaz</a><p class="muted">${esc(seller.name)} · ${esc(seller.phone)}</p>` : ''}
  </div>
  ${SHOPS.length > 1 ? shopSwitch() : ''}${IS_SUPER ? '<a class="btn ghost" href="/patron/">Patron paneli</a>' : ''}
  <button class="btn ghost" id="lo">Çıkış yap</button>`;
  document.getElementById('lo').onclick = logout; bindSwitch();
}

/* ---------- Veri: önce kopya, sonra internet ---------- */
function keyFor(tab) { return tab === 'gun' ? ck('day', P.date) : tab === 'musteri' ? ck('cust') : tab === 'kasa' ? ck('money', P.month) : null; }
function show(tab) {
  P.tab = tab; const k = keyFor(tab);
  if (tab === 'gun') DATA.day = k ? store.get(k) : null;
  if (tab === 'musteri') DATA.cust = store.get(k);
  if (tab === 'kasa') DATA.money = store.get(k);
  render();
  if (tab !== 'ayar') load();
}
let loadSeq = 0;
async function load(silent) {
  const tab = P.tab, key = keyFor(tab), seq = ++loadSeq, sid = SHOP.id;
  if (!key) return;
  try {
    let d;
    if (tab === 'gun') d = await q(() => SB.from('appointments').select('id,date,time,dur,service,name,phone,price,status').eq('shop_id', sid).eq('date', P.date).order('time'));
    else if (tab === 'musteri') d = await q(() => SB.rpc('shop_customers', { p_shop: sid }));
    else d = await q(() => SB.rpc('shop_money', { p_shop: sid, p_month: P.month + '-01' }));
    store.set(key, d);
    if (seq !== loadSeq || P.tab !== tab || keyFor(tab) !== key) return;
    const cur = tab === 'gun' ? DATA.day : tab === 'musteri' ? DATA.cust : DATA.money;
    if (JSON.stringify(cur) === JSON.stringify(d)) return;
    if (tab === 'gun') DATA.day = d; else if (tab === 'musteri') DATA.cust = d; else DATA.money = d;
    if (!(silent && busy())) render();
  } catch (e) {
    if (e && /JWT|jwt|auth/i.test(e.message || '')) return renderLogin('Oturum süresi doldu, tekrar giriş yap.');
    if (e && /YETKI/.test(e.message || '')) return location.reload();
    if (!silent) toast('İnternet yavaş; son kayıtlı bilgiler gösteriliyor.');
  }
}
/* Arkada kaydet; hata olursa geri al */
async function save(fn, undo, okMsg) {
  try { await q(fn, 2); if (okMsg) toast(okMsg); }
  catch (e) { undo && undo(); render(); toast('Kaydedilemedi, tekrar dene.'); }
}
const keepDay = () => store.set(ck('day', P.date), DATA.day);
function setStatus(id, st) {
  const a = (DATA.day || []).find(x => x.id === id); if (!a) return;
  const prev = a.status; a.status = st; P.edit = null; keepDay(); render();
  save(() => SB.from('appointments').update({ status: st }).eq('id', id), () => { a.status = prev; keepDay(); });
}
function setPrice(id, v) {
  const a = (DATA.day || []).find(x => x.id === id); if (!a) return;
  const prev = a.price; a.price = v; P.edit = null; keepDay(); render();
  save(() => SB.from('appointments').update({ price: v }).eq('id', id), () => { a.price = prev; keepDay(); }, 'Ücret kaydedildi');
}
async function addAppt(row) {
  const tmp = { ...row, id: 'tmp' + Date.now() };
  if (row.date === P.date) { DATA.day = [...(DATA.day || []), tmp]; sortDay(); keepDay(); render(); }
  try {
    const r = await q(() => SB.from('appointments').insert({ ...row, shop_id: SHOP.id }).select('id'), 2);
    tmp.id = r[0].id; keepDay(); return tmp.id;
  } catch (e) { DATA.day = (DATA.day || []).filter(x => x !== tmp); keepDay(); render(); toast('Kaydedilemedi, tekrar dene.'); return null; }
}

/* ---------- İskelet ---------- */
function render() {
  const tabs = [['gun', 'Bugün', ICON.today], ['musteri', 'Müşteriler', ICON.people], ['kasa', 'Kasa', ICON.cash], ['ayar', 'Ayarlar', ICON.gear]];
  tabbar.hidden = false;
  tabbar.innerHTML = `<div class="tabbar-in">${tabs.map(([k, v, i]) => `<button class="${P.tab === k ? 'on' : ''}" data-tab="${k}" aria-label="${v}">${i}<span>${v}</span></button>`).join('')}</div>`;
  tabbar.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    if (P.tab === b.dataset.tab) return;
    P.edit = null; P.adding = false; window.scrollTo(0, 0); show(b.dataset.tab);
  });
  ({ gun: tabDay, musteri: tabCust, kasa: tabMoney, ayar: tabSettings })[P.tab]();
}
function subBanner() {
  if (String(SHOP.paid_until) >= '2099') return '';
  const d = daysUntil(SHOP.paid_until);
  return d <= 30 ? `<div class="banner ${d <= 7 ? 'bad' : ''}">Aboneliğin ${d === 0 ? 'bugün' : d + ' gün sonra'} bitiyor (${esc(fmtDs(SHOP.paid_until))}). Yenilemek için Berberim'e yaz.</div>` : '';
}
const skeleton = n => `<div class="card appts">${Array.from({ length: n }, () => '<div class="skel"></div>').join('')}</div>`;

/* ---------- Bugün ---------- */
const remindText = a => `Merhaba ${a.name.split(' ')[0]}, ${SHOP.name} randevunuzu hatırlatırız: ${fmtD(a.date)}, saat ${hm(a.time)} (${a.service}). Görüşmek üzere ✂️`;
function tabDay() {
  const list = DATA.day || [], came = list.filter(a => a.status === 'geldi'), inc = came.reduce((s, a) => s + Number(a.price), 0);
  const waiting = list.filter(a => a.status === 'bekliyor'), sv = SHOP.services, isToday = P.date === ymd(new Date());
  const nowHM = toHM(Math.round((new Date().getHours() * 60 + new Date().getMinutes()) / 15) * 15 % 1440);
  const m = P.cmdMsg || {};
  const row = a => {
    const open = P.edit === a.id;
    return `<div class="appt ${a.status}">
      <button class="appt-row" data-open="${a.id}" aria-expanded="${open}"><span class="t">${hm(a.time)}</span><span class="who"><b>${esc(a.name)}</b><small>${esc(a.service)}</small></span>${a.status === 'bekliyor' ? '' : pill(a.status)}</button>
      ${a.status === 'bekliyor' ? `<button class="btn ok sm" data-st="geldi" data-id="${a.id}">Geldi</button>` : `<span class="money muted">${a.status === 'geldi' ? tl(a.price) : ''}</span>`}
      ${open ? `<div class="appt-more">
        ${a.status === 'geldi' ? `<div class="cmd"><input id="pe" type="number" inputmode="numeric" value="${a.price}" aria-label="Ücret"><button class="btn dark sm" id="peS">Ücreti kaydet</button></div>` : ''}
        <div class="acts">${a.status === 'bekliyor' ? `<button class="btn ghost sm" data-st="gelmedi" data-id="${a.id}">Gelmedi</button><button class="btn ghost sm" data-st="iptal" data-id="${a.id}">İptal</button>` : `<button class="btn ghost sm" data-st="bekliyor" data-id="${a.id}">Geri al</button>`}
        ${a.phone ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${waNum(a.phone)}?text=${encodeURIComponent(remindText(a))}">WhatsApp</a><a class="btn ghost sm" href="tel:${esc(digits(a.phone))}">Ara</a>` : ''}</div>
        ${a.phone ? `<p class="muted small">${esc(a.phone)}</p>` : ''}</div>` : ''}
    </div>`;
  };
  app.innerHTML = `<header class="head"><h1>${esc(SHOP.name)}</h1>
    <div class="daynav"><button class="btn ghost sm" id="pv" aria-label="Önceki gün">‹</button><b>${isToday ? 'Bugün' : esc(fmtD(P.date))}</b><button class="btn ghost sm" id="nx" aria-label="Sonraki gün">›</button></div></header>
  ${subBanner()}
  <div class="kasa"><span>${isToday ? 'Bugünün kasası' : 'Günün kasası'}</span><b class="money">${DATA.day ? tl(inc) : '…'}</b><small>${came.length} müşteri geldi${waiting.length ? ' · ' + waiting.length + ' bekliyor' : ''}</small></div>
  ${SR ? `<button class="bigmic ${listening ? 'rec' : ''}" id="mic">${listening ? ICON.stop : ICON.mic}<span>${listening ? 'Dinliyorum… bitirmek için dokun' : 'Konuşarak kaydet'}</span></button>` : ''}
  <div class="cmd"><input id="cmd" placeholder="${SR ? 'veya yaz: ' : ''}3'te Ahmet geldi 600" aria-label="Kayıt" enterkeyhint="done"><button class="btn dark" id="cmdGo">Kaydet</button></div>
  ${m.ok ? `<div class="note okn">✓ ${esc(m.ok)} ${m.undo ? '<button class="link" id="undo">Geri al</button>' : ''}</div>` : ''}${m.err ? `<p class="err">${esc(m.err)}</p>` : ''}
  <section class="sec"><div class="sec-h"><h2>Randevular</h2><button class="btn ${P.adding ? 'ghost' : 'dark'} sm" id="addT">${P.adding ? 'Vazgeç' : '+ Ekle'}</button></div>
  ${P.adding ? `<div class="card">
    <label for="wN">Ad soyad<input id="wN" maxlength="80"></label>
    <div class="row"><label for="wS">Hizmet<select id="wS">${sv.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label><label for="wT">Saat<input id="wT" type="time" value="${nowHM}"></label></div>
    <div class="row"><label for="wF">Ücret (₺)<input id="wF" type="number" inputmode="numeric" value="${SHOP.fee}"></label><label for="wP">Telefon (isteğe bağlı)<input id="wP" type="tel" inputmode="tel" maxlength="20"></label></div>
    <button class="btn ok" id="wSave">Geldi olarak kaydet</button></div>` : ''}
  ${DATA.day ? `<div class="card appts">${list.map(row).join('') || '<p class="empty">Bu gün için randevu yok.</p>'}</div>
  ${list.length ? '<p class="muted small">Daha fazla seçenek için isme dokun.</p>' : ''}` : skeleton(4)}</section>`;
  const $ = id => document.getElementById(id);
  const go = n => { P.date = ymd(addDays(parseD(P.date), n)); P.edit = null; show('gun'); };
  $('pv').onclick = () => go(-1); $('nx').onclick = () => go(1);
  $('addT').onclick = () => { P.adding = !P.adding; render(); if (P.adding) $('wN').focus(); };
  if (P.adding) $('wSave').onclick = () => {
    const n = $('wN').value.trim(), p = $('wP').value.trim(), s = sv.find(x => x.id === $('wS').value), t = $('wT').value;
    if (n.length < 2 || !t) { toast('İsim ve saat gir.'); return; }
    P.adding = false;
    addAppt({ date: P.date, time: t + ':00', dur: s.dur, service: s.name, price: Math.max(0, Number($('wF').value) || SHOP.fee), name: n, phone: p, status: 'geldi', source: 'panel' });
    toast('Kaydedildi');
  };
  app.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { P.edit = P.edit === b.dataset.open ? null : b.dataset.open; render(); });
  app.querySelectorAll('[data-st]').forEach(b => b.onclick = () => setStatus(b.dataset.id, b.dataset.st));
  if ($('peS')) { const done = () => setPrice(P.edit, Math.max(0, Number($('pe').value) || 0)); $('peS').onclick = done; $('pe').onkeydown = e => { if (e.key === 'Enter') done(); }; }
  bindCmd();
}

/* ---------- Müşteriler ---------- */
function tabCust() {
  const all = DATA.cust || [], today = new Date(), ql = P.q.toLocaleLowerCase('tr');
  const loyal = all.filter(c => c.visits >= 5).length;
  const arr = ql ? all.filter(c => String(c.name).toLocaleLowerCase('tr').includes(ql) || String(c.phone || '').includes(ql)) : all;
  app.innerHTML = `<header class="head"><h1>Müşteriler</h1><p>${DATA.cust ? `${all.length} müşteri · ${loyal} sadık müşteri` : 'Yükleniyor…'}</p></header>
  <input id="q" placeholder="İsim veya telefon ara" value="${esc(P.q)}" aria-label="Müşteri ara" type="search">
  ${DATA.cust ? `<div class="card"><div class="list" id="clist">${custRows(arr.slice(0, 200), today)}</div></div>` : skeleton(6)}`;
  const qi = document.getElementById('q');
  qi.oninput = () => { P.q = qi.value; const ql2 = P.q.toLocaleLowerCase('tr'); const l = document.getElementById('clist'); if (l) l.innerHTML = custRows(all.filter(c => String(c.name).toLocaleLowerCase('tr').includes(ql2) || String(c.phone || '').includes(ql2)).slice(0, 200), today); };
}
function custRows(arr, today) {
  return arr.map(c => {
    const days = c.last_visit ? Math.round((today - parseD(c.last_visit)) / 864e5) : null;
    return `<div class="item"><div class="main"><div><b>${esc(c.name)}</b> ${c.visits >= 5 ? '<span class="pill p-ok">Sadık</span>' : ''} ${days !== null && days >= 30 ? '<span class="pill p-warn">' + days + ' gündür yok</span>' : ''} ${c.no_show >= 2 ? '<span class="pill p-no">' + c.no_show + ' kez gelmedi</span>' : ''}</div>
    <div class="muted small">${c.visits} ziyaret${c.last_visit ? ' · son ' + esc(fmtDs(c.last_visit)) : ''}${c.phone ? ' · ' + esc(c.phone) : ''}</div>
    ${c.phone && days !== null && days >= 30 ? `<div class="acts"><a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${waNum(c.phone)}?text=${encodeURIComponent('Merhaba ' + String(c.name).split(' ')[0] + ', ' + SHOP.name + ' olarak sizi özledik! Randevu için: ' + shopLink(SHOP.slug))}">WhatsApp'tan davet et</a></div>` : ''}</div>
    <b class="money">${tl(c.spent)}</b></div>`;
  }).join('') || '<p class="empty">Henüz müşteri yok. İlk randevu alındığında burada görünür.</p>';
}

/* ---------- Kasa ---------- */
function tabMoney() {
  const [y, mo] = P.month.split('-').map(Number), M = DATA.money;
  const cur = M && M.months ? M.months[M.months.length - 1] : { inc: 0, exp: 0, n: 0 };
  const ex = (M && M.expenses) || [];
  const inc = Number(cur.inc), exp = Number(cur.exp), net = inc - exp;
  const six = M && M.months ? M.months.map((r, i) => ({ label: MONTHS[Number(r.m.slice(5)) - 1].slice(0, 3), value: Number(r.inc), value2: Number(r.exp), hl: i === M.months.length - 1 })) : [];
  const shift = n => { const d = new Date(y, mo - 1 + n, 1); P.month = d.getFullYear() + '-' + pad(d.getMonth() + 1); P.adding = false; show('kasa'); };
  app.innerHTML = `<header class="head"><h1>Kasa</h1>
    <div class="daynav"><button class="btn ghost sm" id="pm" aria-label="Önceki ay">‹</button><b>${MONTHS[mo - 1]} ${y}</b><button class="btn ghost sm" id="nm" aria-label="Sonraki ay">›</button></div></header>
  <div class="kasa"><span>Bu ay net kâr</span><b class="money">${M ? tl(net) : '…'}</b><small>Gelir ${tl(inc)} · Gider ${tl(exp)} · ${cur.n} müşteri</small></div>
  <section class="sec"><h2>Son 6 ay</h2><div class="card">${M ? barChart(six, { aria: 'Son 6 ay gelir ve gider', short: tlShort, fmt: tl }) : '<div class="skel" style="height:150px"></div>'}
    <div class="legend"><span><i style="background:var(--blue)"></i>Gelir</span><span><i style="background:var(--muted);opacity:.35"></i>Gider</span></div></div></section>
  <section class="sec"><div class="sec-h"><h2>Giderler</h2><button class="btn ${P.adding ? 'ghost' : 'dark'} sm" id="eT0">${P.adding ? 'Vazgeç' : '+ Gider ekle'}</button></div>
  ${P.adding ? `<div class="card"><div class="row"><label for="eD">Ne için<input id="eD" maxlength="120" placeholder="Kira, malzeme, fatura"></label><label for="eA">Tutar (₺)<input id="eA" type="number" inputmode="decimal" min="0"></label></div>
    <label for="eT">Tarih<input id="eT" type="date" value="${P.month === ymd(new Date()).slice(0, 7) ? ymd(new Date()) : P.month + '-01'}"></label>
    <button class="btn dark" id="eAdd">Kaydet</button></div>` : ''}
  <div class="card"><div class="list">${ex.map(e => `<div class="item"><div class="main"><div>${esc(e.descr)}</div><div class="muted small">${esc(fmtDs(e.date))}</div></div><b class="money">${tl(e.amount)}</b><button class="btn ghost sm" data-del="${e.id}" aria-label="Sil">Sil</button></div>`).join('') || `<p class="empty">${M ? 'Bu ay gider girilmemiş.' : 'Yükleniyor…'}</p>`}</div></div></section>`;
  const $ = id => document.getElementById(id);
  $('pm').onclick = () => shift(-1); $('nm').onclick = () => shift(1);
  $('eT0').onclick = () => { P.adding = !P.adding; render(); if (P.adding) $('eD').focus(); };
  const keep = () => store.set(ck('money', P.month), DATA.money);
  if ($('eAdd')) $('eAdd').onclick = async () => {
    const d = $('eD').value.trim(), a = Number($('eA').value), t = $('eT').value;
    if (!d || !(a > 0) || !t) { toast('Ne için olduğunu, tutarı ve tarihi gir.'); return; }
    P.adding = false;
    const inMonth = t.startsWith(P.month), tmp = { id: 'tmp' + Date.now(), date: t, descr: d, amount: a };
    if (M && inMonth) { M.expenses = [tmp, ...M.expenses]; cur.exp = Number(cur.exp) + a; keep(); }
    render(); toast('Gider kaydedildi');
    try { const r = await q(() => SB.from('expenses').insert({ shop_id: SHOP.id, date: t, descr: d, amount: a }).select('id'), 2); tmp.id = r[0].id; keep(); render(); }
    catch (e) { if (M && inMonth) { M.expenses = M.expenses.filter(x => x !== tmp); cur.exp = Number(cur.exp) - a; keep(); } render(); toast('Kaydedilemedi, tekrar dene.'); }
  };
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = 'Emin misin?'; return; }
    const e = M.expenses.find(x => x.id === b.dataset.del); if (!e) return;
    M.expenses = M.expenses.filter(x => x !== e); cur.exp = Number(cur.exp) - Number(e.amount); keep(); render();
    save(() => SB.from('expenses').delete().eq('id', e.id), () => { M.expenses.push(e); cur.exp = Number(cur.exp) + Number(e.amount); keep(); }, 'Silindi');
  });
}

/* ---------- Ayarlar ---------- */
function shopSwitch() { return `<label for="shopSel">Dükkan<select id="shopSel">${SHOPS.map(s => `<option value="${s.id}" ${s.id === SHOP.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`; }
function bindSwitch() { const s = document.getElementById('shopSel'); if (s) s.onchange = () => { store.set('berberim_shop', s.value); location.reload(); }; }
let svcDraft = null;
function tabSettings() {
  const st = SHOP, link = shopLink(st.slug);
  if (!svcDraft) svcDraft = st.services.map(s => ({ ...s }));
  const msg = () => document.getElementById('sM').value.replace(/\{isim\}/g, st.name).replace(/\{link\}/g, link);
  const d = daysUntil(st.paid_until), free = String(st.paid_until) >= '2099';
  app.innerHTML = `<header class="head"><h1>Ayarlar</h1></header>
  ${SHOPS.length > 1 ? shopSwitch() : ''}
  <section class="sec"><h2>Randevu linkin</h2><p class="muted small">Müşterilerine bu linki gönder; boş saatleri görüp randevu alırlar.</p>
    <div class="note">${esc(link)}</div>
    <div class="row"><button class="btn dark" id="cpL">Linki kopyala</button><a class="btn ok" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Randevu almak için: ' + link)}">WhatsApp'ta paylaş</a></div></section>
  <details class="fold"><summary>Dükkan bilgileri</summary><div class="fold-in">
    <label for="sN">Dükkan adı<input id="sN" maxlength="60" value="${esc(st.name)}"></label>
    <label for="sPh">Telefon<input id="sPh" type="tel" maxlength="25" value="${esc(st.phone)}"></label>
    <label for="sA">Adres<input id="sA" maxlength="160" value="${esc(st.address)}"></label>
    <label for="sF">Varsayılan ücret (₺)<input id="sF" type="number" inputmode="numeric" value="${st.fee}"></label>
    <p class="muted small">Ücreti müşteriler görmez; kayıtlarda otomatik yazılır, sonra değiştirebilirsin.</p></div></details>
  <details class="fold"><summary>Çalışma saatleri</summary><div class="fold-in">
    <div class="row"><label for="sO">Açılış<input id="sO" type="time" value="${hm(st.open_time)}"></label><label for="sC">Kapanış<input id="sC" type="time" value="${hm(st.close_time)}"></label></div>
    <label for="sS">Randevu aralığı<select id="sS">${[15, 20, 30, 45, 60].map(v => `<option value="${v}" ${st.step == v ? 'selected' : ''}>${v} dakikada bir</option>`).join('')}</select></label>
    <p class="muted small">Kapalı günler</p><div class="check-row">${[1, 2, 3, 4, 5, 6, 0].map(i => `<label for="cd${i}"><input type="checkbox" id="cd${i}" data-cd="${i}" ${st.closed_days.includes(i) ? 'checked' : ''}>${DSH[i]}</label>`).join('')}</div></div></details>
  <details class="fold" ${P.svcOpen ? 'open' : ''}><summary>Hizmetler</summary><div class="fold-in"><div class="list">${svcDraft.map((s, i) => `<div class="item"><div class="main"><div class="row"><input id="vn${i}" maxlength="40" value="${esc(s.name)}" aria-label="Hizmet adı" style="flex:2 1 140px"><select id="vd${i}" aria-label="Süre" style="flex:1 1 90px">${[10, 15, 20, 30, 40, 45, 60, 75, 90, 120].map(v => `<option value="${v}" ${s.dur == v ? 'selected' : ''}>${v} dk</option>`).join('')}</select></div></div>${svcDraft.length > 1 ? `<button class="btn ghost sm" data-rm="${i}" aria-label="Sil">Sil</button>` : ''}</div>`).join('')}</div>
    <button class="btn ghost sm" id="addSvc">+ Hizmet ekle</button></div></details>
  <details class="fold"><summary>WhatsApp otomatik mesajı</summary><div class="fold-in">
    <ol class="steps"><li>Aşağıdaki "Mesajı kopyala"ya bas.</li><li>WhatsApp Business → Araçlar → <b>Uzakta mesajı</b>'nı aç, mesajı yapıştır.</li><li>Zamanlama: <b>Her zaman gönder</b>, Alıcılar: <b>Herkes</b> → Kaydet.</li><li><b>Karşılama mesajı</b>nı kapat (çift mesaj gitmesin).</li></ol>
    <p class="muted small">WhatsApp bu mesajı aynı müşteriye günde bir kez otomatik gönderir.</p>
    <label for="sM">Mesaj<textarea id="sM">${esc(st.msg)}</textarea></label>
    <div class="note" id="prev" style="white-space:pre-wrap"></div><button class="btn ghost" id="cp">Mesajı kopyala</button></div></details>
  <button class="btn" id="sv">Kaydet</button>
  <p class="muted small" style="text-align:center">Abonelik: ${free ? 'süresiz' : d >= 0 ? esc(fmtDs(st.paid_until)) + ' tarihine kadar (' + d + ' gün)' : 'süresi doldu'}</p>
  ${IS_SUPER ? '<a class="btn ghost" href="/patron/">Patron paneli</a>' : ''}
  <button class="btn ghost" id="lo">Çıkış yap</button>`;
  const $ = id => document.getElementById(id);
  const prev = $('prev'); prev.textContent = msg(); $('sM').oninput = () => { prev.textContent = msg(); };
  const grab = () => svcDraft.forEach((s, i) => { s.name = $('vn' + i).value; s.dur = Number($('vd' + i).value); });
  $('cp').onclick = () => copyText(msg()); $('cpL').onclick = () => copyText(link); $('lo').onclick = logout; bindSwitch();
  $('addSvc').onclick = () => { grab(); P.svcOpen = true; svcDraft.push({ id: 'h' + Date.now().toString(36), name: '', dur: 30 }); tabSettings(); $('vn' + (svcDraft.length - 1)).focus(); };
  app.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { grab(); P.svcOpen = true; svcDraft.splice(Number(b.dataset.rm), 1); tabSettings(); });
  $('sv').onclick = async () => {
    grab();
    const services = svcDraft.filter(s => s.name.trim()).map(s => ({ id: s.id, name: s.name.trim().slice(0, 40), dur: s.dur }));
    if (!services.length) { toast('En az bir hizmet olmalı.'); return; }
    const upd = {
      name: $('sN').value.trim() || st.name, phone: $('sPh').value.trim(), address: $('sA').value.trim(),
      open_time: $('sO').value, close_time: $('sC').value, step: Number($('sS').value),
      closed_days: [...app.querySelectorAll('[data-cd]')].filter(c => c.checked).map(c => Number(c.dataset.cd)),
      services, msg: $('sM').value, fee: Math.max(0, Number($('sF').value) || 0)
    };
    if (toMin(upd.close_time) <= toMin(upd.open_time)) { toast('Kapanış saati açılıştan sonra olmalı.'); return; }
    try {
      const r = await q(() => SB.from('shops').update(upd).eq('id', st.id).select('*'), 2);
      if (!r || !r.length) throw new Error('yok');
      SHOP = r[0]; SHOPS = SHOPS.map(s => s.id === SHOP.id ? SHOP : s); store.set('bc:shops', { shops: SHOPS, sup: IS_SUPER }); svcDraft = null; P.svcOpen = false; toast('Kaydedildi'); render();
    } catch (e) { toast('Kaydedilemedi, tekrar dene.'); }
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
  if (price == null) { const n = t.match(/\s(\d{2,5})\s/); if (n) { price = Number(n[1]); t = t.replace(n[0], ' '); } }
  if (!time) { const n = new Date(); time = pad(n.getHours()) + ':' + pad(Math.floor(n.getMinutes() / 15) * 15); }
  let status = 'geldi'; if (/gelmedi|gelmeyecek/.test(t)) status = 'gelmedi'; else if (/iptal/.test(t)) status = 'iptal';
  const sv = SHOP.services; let service = null;
  if (/saç/.test(t) && /sakal/.test(t)) service = sv.find(x => /sakal/i.test(x.name) && /saç/i.test(x.name)); else if (/sakal/.test(t)) service = sv.find(x => /^sakal/i.test(x.name)); else if (/saç/.test(t)) service = sv.find(x => /^saç/i.test(x.name));
  const stop = /^(saat|saatte|da|de|ta|te|müşteri|müşterisi|geldi|gelmedi|gelmeyecek|iptal|olarak|için|ve|ile|kişi|bey|hanım|abi|randevu|randevusu|randevulu|saç|saçı|sakal|sakalı|kesimi|traş|tıraş|şimdi|şu|an|bir|yeni|kayıt|ekle|oldu|etti|tamam|ücret|lira|tl|'?da|'?de|'?ta|'?te)$/;
  const name = t.split(/\s+/).filter(w => w && !/\d/.test(w) && !stop.test(w)).map(w => w.charAt(0).toLocaleUpperCase('tr') + w.slice(1)).join(' ');
  return { time, price, status, service, name };
}
async function runCmd(text) {
  const c = parseCmd(text), list = (DATA.day || []).filter(a => a.status !== 'iptal'), nm = c.name.toLocaleLowerCase('tr');
  const a = list.find(x => hm(x.time) === c.time) || (nm ? list.find(x => x.name.toLocaleLowerCase('tr').includes(nm.split(' ')[0])) : null);
  if (a) {
    const prev = { status: a.status, price: a.price, service: a.service, dur: a.dur };
    const upd = { status: c.status }; if (c.price != null) upd.price = c.price; if (c.service) { upd.service = c.service.name; upd.dur = c.service.dur; }
    Object.assign(a, upd); keepDay();
    P.cmdMsg = { ok: `${hm(a.time)} ${a.name}: ${{ geldi: 'geldi', gelmedi: 'gelmedi', iptal: 'iptal edildi' }[c.status]}${c.status === 'geldi' ? ', ' + tl(a.price) : ''}`, undo: { id: a.id, prev } };
    render();
    save(() => SB.from('appointments').update(upd).eq('id', a.id), () => { Object.assign(a, prev); keepDay(); P.cmdMsg = { err: 'Kaydedilemedi, tekrar dene.' }; });
  } else {
    if (c.status !== 'geldi') { P.cmdMsg = { err: 'Bu saatte veya bu isimde randevu bulunamadı.' }; render(); return; }
    const sv = c.service || SHOP.services[0];
    const row = { date: P.date, time: c.time + ':00', dur: sv.dur, service: sv.name, price: c.price ?? SHOP.fee, name: c.name.length >= 2 ? c.name : 'Kapıdan gelen', phone: '', status: 'geldi', source: 'panel' };
    P.cmdMsg = { ok: `${c.time} ${row.name}: geldi, ${tl(row.price)} (yeni kayıt)` };
    const id = await addAppt(row);
    if (id && P.cmdMsg && P.cmdMsg.ok && P.cmdMsg.ok.startsWith(c.time + ' ' + row.name)) { P.cmdMsg.undo = { id, del: true }; if (!busy()) render(); }
  }
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
function bindCmd() {
  const inp = document.getElementById('cmd'), go = () => { const v = inp.value.trim(); if (v) { inp.value = ''; runCmd(v); } };
  document.getElementById('cmdGo').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
  const u = document.getElementById('undo');
  if (u) u.onclick = () => {
    const x = P.cmdMsg.undo; P.cmdMsg = null;
    const a = (DATA.day || []).find(z => z.id === x.id);
    if (x.del) { DATA.day = (DATA.day || []).filter(z => z.id !== x.id); keepDay(); render(); save(() => SB.from('appointments').delete().eq('id', x.id), null, 'Geri alındı'); }
    else if (a) { const cur = { status: a.status, price: a.price, service: a.service, dur: a.dur }; Object.assign(a, x.prev); keepDay(); render(); save(() => SB.from('appointments').update(x.prev).eq('id', x.id), () => { Object.assign(a, cur); keepDay(); }, 'Geri alındı'); }
  };
  const mic = document.getElementById('mic');
  if (mic) mic.onclick = () => {
    if (listening && rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'tr-TR'; rec.interimResults = true; rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript; } const i2 = document.getElementById('cmd'); if (i2) i2.value = finalText + interim; };
    rec.onerror = e => { listening = false; P.cmdMsg = { err: e.error === 'not-allowed' ? 'Mikrofon izni verilmedi. Tarayıcı ayarlarından izin ver ya da komutu yaz.' : 'Ses anlaşılamadı, tekrar dene.' }; render(); };
    rec.onend = () => { const was = listening; listening = false; const i2 = document.getElementById('cmd'); const v = (i2 && i2.value.trim()) || finalText.trim(); if (was && v) runCmd(v); else render(); };
    try { rec.start(); listening = true; render(); } catch (e) { listening = false; }
  };
}

boot();

