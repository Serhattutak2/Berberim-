/* Berberim · Patron (satıcı) paneli — sadece super_admin */
const app = document.getElementById('app'), tabbar = document.getElementById('tabbar');
const S = { tab: 'berber', shops: [], payments: [], leads: [], settings: null, open: null, mode: null, form: {}, done: null };
const ERRS = {
  LINK: 'Link sadece küçük harf, rakam ve tire içerebilir (en az 3 karakter).', LINK_DOLU: 'Bu link başka bir dükkanda kullanılıyor.',
  AD: 'Dükkan adını yaz.', KULLANICI: 'Kullanıcı adı en az 3 karakter olmalı; sadece küçük harf, rakam, nokta ve tire.',
  KULLANICI_DOLU: 'Bu kullanıcı adı alınmış, başka bir tane yaz.', SIFRE_KISA: 'Şifre en az 6 karakter olmalı.',
  BULUNAMADI: 'Bu kullanıcı bulunamadı.', YETKI: 'Bu işlem için yetkin yok.'
};
const DOMAIN = '@uye.berberim.app';
const login2user = e => String(e || '').endsWith(DOMAIN) ? e.slice(0, -DOMAIN.length) : e;
const trAscii = s => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
const slugify = s => trAscii(s).replace(/&/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const userify = (a, b) => [trAscii(a), trAscii(b)].map(x => x.replace(/[^a-z0-9]+/g, '')).filter(Boolean).join('.').slice(0, 30);
const genPass = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; crypto.getRandomValues(new Uint32Array(8)).forEach(x => s += a[x % a.length]); return s; };
const isFree = s => String(s.paid_until) >= '2099';
const monthsTxt = m => m && m % 12 === 0 ? (m / 12) + ' yıl' : m + ' ay';
const MONTH_OPTS = [1, 3, 6, 12, 24];
const priceFor = m => Math.round((S.settings.yearly_price || 0) * m / 12);
const base = () => window.BERBERIM_CONFIG.publicOrigin || location.origin;
const panelUrl = () => base() + '/panel/';
const shopLinkFor = slug => base() + '/?' + slug;

async function fn(body) {
  const { data, error } = await SB.functions.invoke('patron', { body });
  if (error) {
    let e = null; try { e = await error.context.json(); } catch (x) {}
    throw new Error((e && (ERRS[e.error] || e.detail || e.error)) || 'İşlem yapılamadı, tekrar dene.');
  }
  if (data && data.error) throw new Error(ERRS[data.error] || data.detail || data.error);
  return data;
}

async function boot() {
  try {
    const { data } = await SB.auth.getSession();
    if (!data.session) return login();
    const sup = await q(() => SB.rpc('is_super'));
    if (!sup) { app.innerHTML = `<header class="head"><h1>Yetki yok</h1><p>Bu sayfa sadece Berberim yöneticisi içindir.</p></header><button class="btn ghost" id="lo">Çıkış yap</button>`; document.getElementById('lo').onclick = logout; return; }
    await load(); render();
  } catch (e) { app.innerHTML = `<header class="head"><h1>Bağlantı kurulamadı</h1></header><button class="btn dark" onclick="location.reload()">Tekrar dene</button><p class="foot">${esc(e.message || '')}</p>`; }
}
async function logout() { await SB.auth.signOut(); location.reload(); }
function login(msg) {
  tabbar.hidden = true;
  app.innerHTML = `<header class="head"><h1>Patron girişi</h1><p>Berberim yönetim paneli</p><div class="pole" aria-hidden="true"></div></header>
  <section class="sec"><label for="em">E-posta<input id="em" type="email" autocomplete="email"></label><label for="pw">Şifre<input id="pw" type="password" autocomplete="current-password"></label>
  ${msg ? `<p class="err">${esc(msg)}</p>` : ''}<button class="btn" id="go">Giriş yap</button></section>`;
  const go = async () => { const { error } = await SB.auth.signInWithPassword({ email: document.getElementById('em').value.trim(), password: document.getElementById('pw').value }); if (error) return login('E-posta veya şifre yanlış.'); boot(); };
  document.getElementById('go').onclick = go; document.getElementById('pw').onkeydown = e => { if (e.key === 'Enter') go(); };
}
async function load() {
  const [shops, pays, st, leads] = await Promise.all([q(() => SB.rpc('p_shops')), q(() => SB.rpc('p_payments')), q(() => SB.rpc('p_settings')), q(() => SB.rpc('p_leads')).catch(() => [])]);
  S.shops = shops || []; S.payments = pays || []; S.settings = st; S.leads = leads || [];
}

function render() {
  const nNew = S.leads.filter(l => l.status === 'yeni').length;
  const tabs = [['berber', 'Aboneler', ICON.shop], ['basvuru', 'Başvurular' + (nNew ? ` (${nNew})` : ''), ICON.people], ['para', 'Ödemeler', ICON.cash], ['ayar', 'Ayarlar', ICON.gear]];
  tabbar.hidden = false;
  tabbar.innerHTML = `<div class="tabbar-in">${tabs.map(([k, v, i]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}">${i}<span>${v}</span></button>`).join('')}</div>`;
  tabbar.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.open = null; S.mode = null; window.scrollTo(0, 0); render(); });
  ({ berber: tabShops, basvuru: tabLeads, para: tabPay, ayar: tabSettings })[S.tab]();
}
const status = s => {
  if (isFree(s)) return '<span class="pill p-ok">Süresiz</span>';
  const d = daysUntil(s.paid_until);
  if (!s.active) return '<span class="pill p-no">Durduruldu</span>';
  if (d < 0) return `<span class="pill p-no">${-d} gün önce bitti</span>`;
  if (d <= 30) return `<span class="pill p-warn">${d} gün kaldı</span>`;
  return `<span class="pill p-ok">${d} gün kaldı</span>`;
};

function newForm() {
  const f = S.form;
  return `<section class="sec card"><h2>Yeni abone</h2>
    <label for="nN">Dükkan adı<input id="nN" maxlength="60" value="${esc(f.name || '')}" placeholder="Ahmet Usta Berber"></label>
    <div class="row"><label for="nF">Berberin adı<input id="nF" maxlength="40" value="${esc(f.first || '')}"></label><label for="nL">Soyadı<input id="nL" maxlength="40" value="${esc(f.last || '')}"></label></div>
    <div class="row"><label for="nU">Kullanıcı adı<input id="nU" maxlength="30" autocapitalize="off" autocomplete="off" value="${esc(f.user || '')}" placeholder="ahmet.yilmaz"></label><label for="nW">Şifre<input id="nW" maxlength="40" autocapitalize="off" autocomplete="off" value="${esc(f.pass || '')}"></label></div>
    <label for="nP">Berberin telefonu<input id="nP" type="tel" maxlength="25" value="${esc(f.phone || '')}" placeholder="05xx xxx xx xx"></label>
    <label for="nS">Dükkan linki<input id="nS" maxlength="40" autocapitalize="off" value="${esc(f.slug || '')}" placeholder="ahmet-usta"></label>
    <p class="muted small" id="nLink">${esc(shopLinkFor(f.slug || '…'))}</p>
    <div class="row"><label for="nM">Süre<select id="nM">${MONTH_OPTS.map(m => `<option value="${m}" ${(f.months || 12) == m ? 'selected' : ''}>${monthsTxt(m)}</option>`).join('')}</select></label>
    <label for="nA">Alınan ödeme (₺)<input id="nA" type="number" inputmode="numeric" value="${f.amount ?? priceFor(f.months || 12)}"></label></div>
    <label for="nNo">Not (isteğe bağlı)<input id="nNo" maxlength="200" value="${esc(f.note || '')}"></label>
    <p class="err" id="nErr" hidden></p>
    <button class="btn" id="nGo">Aboneyi oluştur</button><button class="btn ghost" id="nX">Vazgeç</button></section>`;
}

function tabShops() {
  const year = String(new Date().getFullYear());
  const paid = S.shops.filter(s => !isFree(s));
  const active = paid.filter(s => s.active && daysUntil(s.paid_until) >= 0).length;
  const soon = paid.filter(s => s.active && daysUntil(s.paid_until) >= 0 && daysUntil(s.paid_until) <= 30).length;
  const yearRev = S.payments.filter(p => String(p.paid_on).startsWith(year)).reduce((a, p) => a + Number(p.amount), 0);
  app.innerHTML = `<header class="head"><h1>Berberim Patron</h1><p>Aboneler, süreler ve ödemeler</p><div class="pole" aria-hidden="true"></div></header>
  <div class="stats"><div class="stat hero"><b class="money">${tl(yearRev)}</b><span>${year} geliri</span></div>
    <div class="stat"><b>${active}</b><span>Aktif abone</span></div><div class="stat"><b>${soon}</b><span>30 günde bitecek</span></div><div class="stat"><b>${paid.length - active}</b><span>Bitmiş / durmuş</span></div></div>
  ${S.done ? `<section class="sec card" style="border-color:var(--ok)"><h2>${esc(S.done.name)} hazır</h2><p class="muted">Bu bilgileri berbere ver:</p><div class="note" style="white-space:pre-wrap">${esc(S.done.text)}</div>
    <div class="row"><button class="btn dark" id="doneCp">Kopyala</button>${S.done.phone ? `<a class="btn ok" target="_blank" rel="noopener" href="https://wa.me/${waNum(S.done.phone)}?text=${encodeURIComponent(S.done.text)}">WhatsApp'tan gönder</a>` : ''}</div><button class="link" id="doneX">Kapat</button></section>` : ''}
  ${S.mode === 'new' ? newForm() : `<button class="btn" id="new">+ Yeni abone oluştur</button>`}
  <section class="sec"><h2>Aboneler</h2><div class="card"><div class="list">${S.shops.map(shopItem).join('') || '<p class="empty">Henüz abone yok. "Yeni abone oluştur" ile başla.</p>'}</div></div></section>`;
  const $ = id => document.getElementById(id);
  if ($('new')) $('new').onclick = () => { S.mode = 'new'; S.done = null; S.form = { pass: genPass(), months: 12 }; render(); $('nN').focus(); };
  if ($('nX')) $('nX').onclick = () => { S.mode = null; render(); };
  if ($('nN')) {
    let slugTouched = !!S.form.slug, userTouched = !!S.form.user;
    const upLink = () => { $('nLink').textContent = shopLinkFor($('nS').value || '…'); };
    $('nN').oninput = () => { if (!slugTouched) { $('nS').value = slugify($('nN').value); upLink(); } };
    const upUser = () => { if (!userTouched) $('nU').value = userify($('nF').value, $('nL').value); };
    $('nF').oninput = upUser; $('nL').oninput = upUser;
    $('nU').oninput = () => { userTouched = true; }; $('nS').oninput = () => { slugTouched = true; upLink(); };
    $('nM').onchange = () => { $('nA').value = priceFor(Number($('nM').value)); };
    $('nGo').onclick = async () => {
      const first = $('nF').value.trim(), last = $('nL').value.trim();
      const body = { action: 'create_shop', name: $('nN').value.trim(), owner: (first + ' ' + last).trim(), username: $('nU').value.trim().toLowerCase(), password: $('nW').value.trim(), phone: $('nP').value.trim(), slug: $('nS').value.trim().toLowerCase(), months: Number($('nM').value), amount: Number($('nA').value) || 0, note: $('nNo').value.trim() };
      S.form = { name: body.name, first, last, user: body.username, pass: body.password, phone: body.phone, slug: body.slug, months: body.months, amount: body.amount, note: body.note };
      const er = $('nErr');
      if (!first) { er.textContent = 'Berberin adını yaz.'; er.hidden = false; return; }
      const b = $('nGo'); b.disabled = true; b.textContent = 'Oluşturuluyor…';
      try {
        const r = await fn(body);
        const text = `Merhaba ${first}, Berberim hesabın hazır ✂️\n\nBerber paneli: ${panelUrl()}\nKullanıcı adı: ${body.username}\nŞifre: ${body.password}\n\nMüşterilerine göndereceğin randevu linki:\n${shopLinkFor(body.slug)}\n\nAbonelik: ${monthsTxt(body.months)}, ${fmtDs(r.paid_until)} tarihine kadar.`;
        if (S.form.leadId || S.leadId) { try { await q(() => SB.rpc('p_lead_status', { p_id: S.leadId, p_status: 'abone' }), 1); } catch (x) {} S.leadId = null; }
        S.done = { name: body.name, phone: body.phone, text }; S.mode = null; S.form = {};
        await load(); render(); window.scrollTo(0, 0);
      } catch (e) { b.disabled = false; b.textContent = 'Aboneyi oluştur'; er.textContent = e.message; er.hidden = false; }
    };
  }
  if ($('doneCp')) $('doneCp').onclick = () => copyText(S.done.text);
  if ($('doneX')) $('doneX').onclick = () => { S.done = null; render(); };
  bindShopItems();
}

function shopItem(s) {
  const open = S.open === s.id, m = open ? S.mode : null, users = (s.emails || []).map(login2user);
  const pays = S.payments.filter(p => p.shop === s.name);
  return `<div class="item"><div class="main">
    <div class="sec-h"><b>${esc(s.name)}</b>${status(s)}</div>
    <div class="muted small">${esc(s.owner_name || users[0] || '')}${isFree(s) ? ' · Süresiz, ücretsiz' : ` · ${esc(fmtDs(s.paid_until))} bitiş · toplam ${monthsTxt(s.total_months || 0)} verildi`}</div>
    ${open ? `<div class="note small">Kullanıcı adı: <b>${esc(users.join(', ') || '—')}</b><br>Başlangıç: ${esc(fmtDs(String(s.created_at).slice(0, 10)))}<br>Toplam ödeme: ${tl(s.total_paid)} (${s.pay_count} kez)<br>Son 30 günde ${s.appts_30d} randevu<br>Link: ${esc(shopLinkFor(s.slug))}${s.phone ? '<br>Tel: ' + esc(s.phone) : ''}${s.note ? '<br>Not: ' + esc(s.note) : ''}</div>
      ${pays.length ? `<div class="small muted">${pays.map(p => `${esc(fmtDs(p.paid_on))}: ${monthsTxt(p.months || 0)}, ${tl(p.amount)}`).join('<br>')}</div>` : ''}
      ${m === 'extend' ? `<div class="row"><label for="xM">Süre ekle<select id="xM">${MONTH_OPTS.map(o => `<option value="${o}" ${o === 12 ? 'selected' : ''}>${monthsTxt(o)}</option>`).join('')}</select></label><label for="xA">Alınan (₺)<input id="xA" type="number" inputmode="numeric" value="${priceFor(12)}"></label></div>
        <div class="acts"><button class="btn ok sm" data-x="extendGo" data-id="${s.id}">Ödemeyi kaydet ve uzat</button><button class="btn ghost sm" data-x="cancel">Vazgeç</button></div>`
      : m === 'pass' ? `<label for="rU">Kullanıcı<select id="rU">${users.map(u => `<option>${esc(u)}</option>`).join('')}</select></label><label for="rP">Yeni şifre<input id="rP" autocapitalize="off" value="${genPass()}"></label>
        <div class="acts"><button class="btn dark sm" data-x="passGo" data-id="${s.id}">Şifreyi değiştir</button><button class="btn ghost sm" data-x="cancel">Vazgeç</button></div>`
      : m === 'member' ? `<p class="muted small">Dükkana ikinci bir kullanıcı (çalışan) ekler.</p><div class="row"><label for="mU">Kullanıcı adı<input id="mU" autocapitalize="off"></label><label for="mP">Şifre<input id="mP" autocapitalize="off" value="${genPass()}"></label></div>
        <div class="acts"><button class="btn dark sm" data-x="memberGo" data-id="${s.id}">Kullanıcı ekle</button><button class="btn ghost sm" data-x="cancel">Vazgeç</button></div>`
      : m === 'edit' ? `<label for="eN">Dükkan adı<input id="eN" value="${esc(s.name)}"></label><label for="eO">Berberin adı soyadı<input id="eO" value="${esc(s.owner_name || '')}"></label>
        <div class="row"><label for="eP">Telefon<input id="eP" type="tel" value="${esc(s.phone || '')}"></label><label for="eS">Link<input id="eS" value="${esc(s.slug)}"></label></div>
        ${isFree(s) ? '' : `<label for="eU">Bitiş tarihi<input id="eU" type="date" value="${s.paid_until}"></label>`}<label for="eNo">Not<input id="eNo" value="${esc(s.note || '')}"></label>
        <div class="acts"><button class="btn dark sm" data-x="editGo" data-id="${s.id}">Kaydet</button><button class="btn ghost sm" data-x="cancel">Vazgeç</button></div>`
      : `<div class="acts">${isFree(s) ? '' : `<button class="btn ok sm" data-x="extend" data-id="${s.id}">+ Süre ekle</button>`}<button class="btn ghost sm" data-x="copy" data-slug="${esc(s.slug)}">Linki kopyala</button>
        <button class="btn ghost sm" data-x="pass" data-id="${s.id}">Şifre değiştir</button><button class="btn ghost sm" data-x="member" data-id="${s.id}">Kullanıcı ekle</button>
        <button class="btn ghost sm" data-x="edit" data-id="${s.id}">Düzenle</button>${isFree(s) ? '' : `<button class="btn ghost sm" data-x="toggle" data-id="${s.id}" data-on="${s.active ? 0 : 1}">${s.active ? 'Durdur' : 'Aç'}</button>`}</div>`}` : ''}
  </div><button class="btn ghost sm" data-x="open" data-id="${s.id}" aria-label="${open ? 'Kapat' : 'Detay'}">${open ? '−' : '+'}</button></div>`;
}
function bindShopItems() {
  const $ = id => document.getElementById(id);
  const act = async (fnc, ok) => { try { await fnc(); toast(ok); S.mode = null; await load(); render(); } catch (e) { toast(e.message || 'İşlem yapılamadı.'); } };
  const xM = $('xM'); if (xM) xM.onchange = () => { $('xA').value = priceFor(Number(xM.value)); };
  app.querySelectorAll('[data-x]').forEach(b => b.onclick = () => {
    const x = b.dataset.x, id = b.dataset.id;
    if (x === 'open') { S.open = S.open === id ? null : id; S.mode = null; return render(); }
    if (x === 'cancel') { S.mode = null; return render(); }
    if (['extend', 'pass', 'member', 'edit'].includes(x)) { S.mode = x; return render(); }
    if (x === 'copy') return copyText(shopLinkFor(b.dataset.slug));
    if (x === 'toggle') {
      if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = 'Emin misin?'; return; }
      return act(() => q(() => SB.rpc('p_set_active', { p_shop: id, p_active: b.dataset.on === '1' }), 1), b.dataset.on === '1' ? 'Açıldı' : 'Durduruldu');
    }
    if (x === 'extendGo') return act(() => q(() => SB.rpc('p_extend_months', { p_shop: id, p_months: Number($('xM').value), p_amount: Number($('xA').value) || 0, p_note: '' }), 1), 'Ödeme kaydedildi, süre uzatıldı');
    if (x === 'passGo') return act(async () => { const username = $('rU').value, password = $('rP').value.trim(); await fn({ action: 'reset_password', username, password }); await copyText(`Berberim yeni şifren\nKullanıcı adı: ${username}\nŞifre: ${password}\nGiriş: ${panelUrl()}`); }, 'Şifre değişti, bilgiler kopyalandı');
    if (x === 'memberGo') return act(() => fn({ action: 'add_member', shop_id: id, username: $('mU').value.trim(), password: $('mP').value.trim() }), 'Kullanıcı eklendi');
    if (x === 'editGo') { const s = S.shops.find(z => z.id === id); return act(() => q(() => SB.rpc('p_update_shop2', { p_shop: id, p_name: $('eN').value.trim(), p_owner: $('eO').value.trim(), p_slug: $('eS').value.trim().toLowerCase(), p_note: $('eNo').value, p_paid_until: $('eU') ? $('eU').value : s.paid_until, p_phone: $('eP').value.trim() }), 1), 'Kaydedildi'); }
  });
}

const LST = { yeni: '<span class="pill p-warn">Yeni</span>', 'goruşuldu': '<span class="pill p-wait">Görüşüldü</span>', abone: '<span class="pill p-ok">Abone oldu</span>', iptal: '<span class="pill p-no">Vazgeçti</span>' };
function tabLeads() {
  app.innerHTML = `<header class="head"><h1>Başvurular</h1><p>Tanıtım sayfasından gelenler</p></header>
  <div class="note small">Tanıtım linki: ${esc(base() + '/tanitim/')} <button class="link" id="cpT">Kopyala</button></div>
  <div class="card"><div class="list">${S.leads.map(l => `<div class="item"><div class="main">
    <div class="sec-h"><b>${esc(l.shop_name)}</b>${LST[l.status] || ''}</div>
    <div class="muted small">${esc(l.person)} · ${esc(l.phone)}${l.city ? ' · ' + esc(l.city) : ''} · ${esc(fmtDs(String(l.created_at).slice(0, 10)))}</div>
    ${l.note ? `<div class="note small">${esc(l.note)}</div>` : ''}
    <div class="acts"><a class="btn ok sm" target="_blank" rel="noopener" href="https://wa.me/${waNum(l.phone)}?text=${encodeURIComponent('Merhaba ' + l.person.split(' ')[0] + ', Berberim başvurunuz için yazıyorum.')}">WhatsApp</a><a class="btn ghost sm" href="tel:${esc(digits(l.phone))}">Ara</a>
    ${l.status !== 'abone' ? `<button class="btn dark sm" data-conv="${l.id}">Aboneye çevir</button>` : ''}
    ${l.status === 'yeni' ? `<button class="btn ghost sm" data-ls="goruşuldu" data-id="${l.id}">Görüşüldü</button>` : ''}${l.status !== 'iptal' && l.status !== 'abone' ? `<button class="btn ghost sm" data-ls="iptal" data-id="${l.id}">Vazgeçti</button>` : ''}</div>
  </div></div>`).join('') || '<p class="empty">Henüz başvuru yok. Tanıtım linkini paylaştığında buraya düşer.</p>'}</div></div>`;
  document.getElementById('cpT').onclick = () => copyText(base() + '/tanitim/');
  app.querySelectorAll('[data-ls]').forEach(b => b.onclick = async () => {
    const l = S.leads.find(x => x.id === b.dataset.id), prev = l.status; l.status = b.dataset.ls; render();
    try { await q(() => SB.rpc('p_lead_status', { p_id: l.id, p_status: l.status }), 1); } catch (e) { l.status = prev; render(); toast('Kaydedilemedi.'); }
  });
  app.querySelectorAll('[data-conv]').forEach(b => b.onclick = () => {
    const l = S.leads.find(x => x.id === b.dataset.conv), parts = l.person.trim().split(/\s+/);
    const last = parts.length > 1 ? parts.pop() : '', first = parts.join(' ');
    S.leadId = l.id; S.tab = 'berber'; S.mode = 'new'; S.done = null;
    S.form = { name: l.shop_name, first, last, user: userify(first, last), pass: genPass(), phone: l.phone, slug: slugify(l.shop_name), months: 12, note: l.city };
    window.scrollTo(0, 0); render();
  });
}

function tabPay() {
  const now = new Date(), months = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1), k = d.getFullYear() + '-' + pad(d.getMonth() + 1); months.push({ label: i % 2 ? '' : MONTHS[d.getMonth()].slice(0, 3), value: S.payments.filter(p => String(p.paid_on).startsWith(k)).reduce((a, p) => a + Number(p.amount), 0), hl: i === 0 }); }
  const total = S.payments.reduce((a, p) => a + Number(p.amount), 0);
  const upcoming = S.shops.filter(s => !isFree(s) && s.active).sort((a, b) => a.paid_until.localeCompare(b.paid_until)).slice(0, 8);
  app.innerHTML = `<header class="head"><h1>Ödemeler</h1><p>Toplam ${tl(total)}</p></header>
  <section class="sec"><h2>Son 12 ay</h2><div class="card">${barChart(months, { aria: 'Son 12 ay abonelik gelirleri', short: tlShort, fmt: tl })}</div></section>
  <section class="sec"><h2>Sırada bitecekler</h2><div class="card"><div class="list">${upcoming.map(s => `<div class="item"><div class="main"><div class="sec-h"><b>${esc(s.name)}</b>${status(s)}</div><div class="muted small">${esc(fmtDs(s.paid_until))}</div></div></div>`).join('') || '<p class="empty">Bitecek abonelik yok.</p>'}</div></div></section>
  <section class="sec"><h2>Tüm ödemeler</h2><div class="card"><div class="list">${S.payments.map(p => `<div class="item"><div class="main"><div><b>${esc(p.shop)}</b></div><div class="muted small">${esc(fmtDs(p.paid_on))} · ${monthsTxt(p.months || 0)}${p.note ? ' · ' + esc(p.note) : ''}</div></div><b class="money">${tl(p.amount)}</b></div>`).join('') || '<p class="empty">Henüz ödeme kaydı yok.</p>'}</div></div></section>`;
}

function tabSettings() {
  const st = S.settings;
  app.innerHTML = `<header class="head"><h1>Ayarlar</h1></header>
  <section class="sec"><p class="muted">Süresi biten berbere bu isim ve numara gösterilir; "yenilemek için yaz" düğmesi sana gelir.</p>
    <label for="sN">Adın<input id="sN" value="${esc(st.seller_name)}"></label>
    <label for="sP">WhatsApp numaran<input id="sP" type="tel" value="${esc(st.seller_phone)}" placeholder="05xx xxx xx xx"></label>
    <label for="sY">Yıllık fiyat (₺)<input id="sY" type="number" inputmode="numeric" value="${st.yearly_price}"></label>
    <p class="muted small">Ay seçince tutar bu fiyata göre otomatik hesaplanır, istersen elle değiştirirsin.</p>
    <button class="btn" id="sv">Kaydet</button></section>
  <section class="sec"><h2>Adresler</h2><div class="note small">Satış sayfası: ${esc(base())}<br>Berber girişi: ${esc(panelUrl())}<br>Patron: ${esc(base() + '/patron/')}</div></section>
  <a class="btn ghost" href="/panel/">Berber paneline geç</a>
  <button class="btn ghost" id="lo">Çıkış yap</button>`;
  document.getElementById('lo').onclick = logout;
  document.getElementById('sv').onclick = async () => {
    try { await q(() => SB.rpc('p_save_settings', { p_name: document.getElementById('sN').value, p_phone: document.getElementById('sP').value, p_price: Number(document.getElementById('sY').value) || 0 }), 1); await load(); toast('Kaydedildi'); render(); }
    catch (e) { toast('Kaydedilemedi.'); }
  };
}

boot();
