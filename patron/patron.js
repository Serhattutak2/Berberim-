/* Berberim · Patron (satıcı) paneli — sadece super_admin */
const app = document.getElementById('app'), tabbar = document.getElementById('tabbar');
const S = { tab: 'berber', shops: [], payments: [], settings: null, open: null, mode: null, form: {} };
const ERRS = {
  LINK: 'Link sadece küçük harf, rakam ve tire içerebilir (en az 3 harf).', LINK_DOLU: 'Bu link başka bir dükkanda kullanılıyor.',
  AD: 'Dükkan adını yaz.', EPOSTA: 'E-posta adresi geçersiz.', SIFRE_KISA: 'Şifre en az 8 karakter olmalı.',
  BULUNAMADI: 'Bu e-postayla hesap bulunamadı.', YETKI: 'Bu işlem için yetkin yok.'
};
const slugify = s => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/&/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const genPass = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; const r = crypto.getRandomValues(new Uint32Array(10)); r.forEach(x => s += a[x % a.length]); return s; };

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
async function logout() { await SB.auth.signOut(); location.href = '/panel/'; }
function login(msg) {
  app.innerHTML = `<header class="head"><h1>Patron girişi</h1><div class="pole" aria-hidden="true"></div></header>
  <section class="sec"><label for="em">E-posta<input id="em" type="email" autocomplete="email"></label><label for="pw">Şifre<input id="pw" type="password" autocomplete="current-password"></label>
  ${msg ? `<p class="err">${esc(msg)}</p>` : ''}<button class="btn" id="go">Giriş yap</button></section>`;
  const go = async () => { const { error } = await SB.auth.signInWithPassword({ email: document.getElementById('em').value.trim(), password: document.getElementById('pw').value }); if (error) return login('E-posta veya şifre yanlış.'); boot(); };
  document.getElementById('go').onclick = go; document.getElementById('pw').onkeydown = e => { if (e.key === 'Enter') go(); };
}
async function load() {
  const [shops, pays, st] = await Promise.all([q(() => SB.rpc('p_shops')), q(() => SB.rpc('p_payments')), q(() => SB.rpc('p_settings'))]);
  S.shops = shops || []; S.payments = pays || []; S.settings = st;
}

function render() {
  const tabs = [['berber', 'Berberler', ICON.shop], ['para', 'Ödemeler', ICON.cash], ['ayar', 'Ayarlar', ICON.gear]];
  tabbar.hidden = false;
  tabbar.innerHTML = `<div class="tabbar-in">${tabs.map(([k, v, i]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}">${i}<span>${v}</span></button>`).join('')}</div>`;
  tabbar.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.open = null; S.mode = null; window.scrollTo(0, 0); render(); });
  ({ berber: tabShops, para: tabPay, ayar: tabSettings })[S.tab]();
}
const isFree = s => String(s.paid_until) >= '2099';
const status = s => {
  if (isFree(s)) return '<span class="pill p-ok">Süresiz</span>';
  const d = daysUntil(s.paid_until);
  if (!s.active) return '<span class="pill p-no">Durduruldu</span>';
  if (d < 0) return '<span class="pill p-no">Süresi doldu</span>';
  if (d <= 30) return `<span class="pill p-warn">${d} gün kaldı</span>`;
  return '<span class="pill p-ok">Aktif</span>';
};

function tabShops() {
  const price = S.settings.yearly_price, year = String(new Date().getFullYear());
  const active = S.shops.filter(s => s.active && daysUntil(s.paid_until) >= 0).length;
  const soon = S.shops.filter(s => !isFree(s) && s.active && daysUntil(s.paid_until) >= 0 && daysUntil(s.paid_until) <= 30).length;
  const yearRev = S.payments.filter(p => String(p.paid_on).startsWith(year)).reduce((a, p) => a + Number(p.amount), 0);
  const f = S.form;
  app.innerHTML = `<header class="head"><h1>Berberim Patron</h1><p>Berberlerin, abonelikler ve ödemeler.</p><div class="pole" aria-hidden="true"></div></header>
  <div class="stats"><div class="stat hero"><b class="money">${tl(yearRev)}</b><span>${year} geliri</span></div>
    <div class="stat"><b>${active}</b><span>Aktif berber</span></div><div class="stat"><b>${soon}</b><span>30 günde bitecek</span></div><div class="stat"><b>${S.shops.length - active}</b><span>Kapalı</span></div></div>
  ${S.mode === 'new' ? `<section class="sec card"><h2>Yeni berber</h2>
    <label for="nN">Dükkan adı<input id="nN" maxlength="60" value="${esc(f.name || '')}" placeholder="Ahmet Usta Berber"></label>
    <label for="nS">Link<input id="nS" maxlength="40" value="${esc(f.slug || '')}" placeholder="ahmet-usta"></label>
    <p class="muted small" id="nLink">Müşteri linki: ${esc(shopLinkFor(f.slug || '…'))}</p>
    <div class="row"><label for="nE">Berberin e-postası<input id="nE" type="email" value="${esc(f.email || '')}"></label><label for="nP">Berberin telefonu<input id="nP" type="tel" value="${esc(f.phone || '')}"></label></div>
    <label for="nW">Giriş şifresi<input id="nW" value="${esc(f.pass || genPass())}"></label>
    <div class="row"><label for="nY">Süre<select id="nY">${[1, 2, 3].map(y => `<option value="${y}">${y} yıl</option>`).join('')}</select></label><label for="nA">Alınan ödeme (₺)<input id="nA" type="number" inputmode="numeric" value="${price}"></label></div>
    <p class="err" id="nErr" hidden></p>
    <button class="btn" id="nGo">Berberi oluştur</button><button class="btn ghost" id="nX">Vazgeç</button></section>`
    : `<button class="btn dark" id="new">+ Yeni berber ekle</button>`}
  ${S.done ? `<section class="sec card" style="border-color:var(--ok)"><h2>Hazır: ${esc(S.done.name)}</h2><p class="muted">Bu bilgileri berbere gönder:</p><div class="note" style="white-space:pre-wrap" id="doneTxt">${esc(S.done.text)}</div>
    <div class="row"><button class="btn dark" id="doneCp">Kopyala</button>${S.done.phone ? `<a class="btn ok" target="_blank" rel="noopener" href="https://wa.me/${waNum(S.done.phone)}?text=${encodeURIComponent(S.done.text)}">WhatsApp'tan gönder</a>` : ''}</div><button class="link" id="doneX">Kapat</button></section>` : ''}
  <section class="sec"><h2>Berberler</h2><div class="card"><div class="list">${S.shops.map(s => shopItem(s, price)).join('') || '<p class="empty">Henüz berber yok. "Yeni berber ekle" ile başla.</p>'}</div></div></section>`;
  const $ = id => document.getElementById(id);
  if ($('new')) $('new').onclick = () => { S.mode = 'new'; S.form = { pass: genPass() }; render(); $('nN').focus(); };
  if ($('nX')) $('nX').onclick = () => { S.mode = null; render(); };
  if ($('nN')) {
    let touched = !!f.slug;
    $('nS').oninput = () => { touched = true; $('nLink').textContent = 'Müşteri linki: ' + shopLinkFor($('nS').value || '…'); };
    $('nN').oninput = () => { if (!touched) { $('nS').value = slugify($('nN').value); $('nLink').textContent = 'Müşteri linki: ' + shopLinkFor($('nS').value || '…'); } };
    $('nGo').onclick = async () => {
      const body = { action: 'create_shop', name: $('nN').value.trim(), slug: $('nS').value.trim().toLowerCase(), email: $('nE').value.trim(), phone: $('nP').value.trim(), password: $('nW').value, years: Number($('nY').value), amount: Number($('nA').value) || 0, record_payment: true };
      S.form = { name: body.name, slug: body.slug, email: body.email, phone: body.phone, pass: body.password };
      const b = $('nGo'); b.disabled = true; b.textContent = 'Oluşturuluyor…';
      try {
        const r = await fn(body);
        const link = shopLinkFor(body.slug);
        const text = `Berberim hesabın hazır ✂️\n\nMüşteri randevu linkin:\n${link}\n\nBerber paneli:\n${panelUrl()}\nE-posta: ${body.email}\n${r.user_created ? 'Şifre: ' + body.password : 'Şifre: mevcut şifren'}\n\nAbonelik: ${fmtDs(r.paid_until)} tarihine kadar.`;
        S.done = { name: body.name, phone: body.phone, text }; S.mode = null; S.form = {};
        await load(); render(); window.scrollTo(0, 0);
      } catch (e) { b.disabled = false; b.textContent = 'Berberi oluştur'; const er = $('nErr'); er.textContent = e.message; er.hidden = false; }
    };
  }
  if ($('doneCp')) $('doneCp').onclick = () => copyText(S.done.text);
  if ($('doneX')) $('doneX').onclick = () => { S.done = null; render(); };
  bindShopItems(price);
}
const panelUrl = () => (window.BERBERIM_CONFIG.publicOrigin || location.origin) + '/panel/';
function shopLinkFor(slug) { return (window.BERBERIM_CONFIG.publicOrigin || location.origin) + '/?' + slug; }

function shopItem(s, price) {
  const open = S.open === s.id, m = S.mode && S.open === s.id ? S.mode : null;
  return `<div class="item"><div class="main">
    <div class="sec-h"><b>${esc(s.name)}</b>${status(s)}</div>
    <div class="muted small">${isFree(s) ? 'Süresiz, ücretsiz' : esc(fmtDs(s.paid_until)) + ' bitiş'} · son 30 günde ${s.appts_30d} randevu · toplam ${tl(s.total_paid)}</div>
    ${open ? `<div class="note small">Link: ${esc(shopLinkFor(s.slug))}<br>Berber: ${esc((s.emails || []).join(', ') || '—')}${s.phone ? '<br>Tel: ' + esc(s.phone) : ''}${s.note ? '<br>Not: ' + esc(s.note) : ''}</div>
      ${m === 'extend' ? `<div class="row"><label for="xY">Süre<select id="xY">${[1, 2, 3].map(y => `<option value="${y}">${y} yıl</option>`).join('')}</select></label><label for="xA">Alınan (₺)<input id="xA" type="number" inputmode="numeric" value="${price}"></label></div>
        <div class="acts"><button class="btn ok sm" data-x="extendGo" data-id="${s.id}">Ödemeyi kaydet ve uzat</button><button class="btn ghost sm" data-x="cancel">Vazgeç</button></div>`
      : m === 'pass' ? `<label for="rE">E-posta<select id="rE">${(s.emails || []).map(e => `<option>${esc(e)}</option>`).join('')}</select></label><label for="rP">Yeni şifre<input id="rP" value="${genPass()}"></label>
        <div class="acts"><button class="btn dark sm" data-x="passGo" data-id="${s.id}">Şifreyi değiştir</button><button class="btn ghost sm" data-x="cancel">Vazgeç</button></div>`
      : m === 'member' ? `<label for="mE">E-posta<input id="mE" type="email"></label><label for="mP">Şifre (yeni hesapsa)<input id="mP" value="${genPass()}"></label>
        <div class="acts"><button class="btn dark sm" data-x="memberGo" data-id="${s.id}">Hesap ekle</button><button class="btn ghost sm" data-x="cancel">Vazgeç</button></div>`
      : m === 'edit' ? `<label for="eN">Dükkan adı<input id="eN" value="${esc(s.name)}"></label><label for="eS">Link<input id="eS" value="${esc(s.slug)}"></label>
        <label for="eU">Bitiş tarihi<input id="eU" type="date" value="${s.paid_until}"></label><label for="eNo">Not<input id="eNo" value="${esc(s.note || '')}"></label>
        <div class="acts"><button class="btn dark sm" data-x="editGo" data-id="${s.id}">Kaydet</button><button class="btn ghost sm" data-x="cancel">Vazgeç</button></div>`
      : isFree(s) ? `<div class="acts"><button class="btn ghost sm" data-x="copy" data-slug="${esc(s.slug)}">Linki kopyala</button><button class="btn ghost sm" data-x="pass" data-id="${s.id}">Şifre sıfırla</button><button class="btn ghost sm" data-x="member" data-id="${s.id}">Hesap ekle</button></div>`
      : `<div class="acts"><button class="btn ok sm" data-x="extend" data-id="${s.id}">+ Yıl ekle</button><button class="btn ghost sm" data-x="copy" data-slug="${esc(s.slug)}">Linki kopyala</button>
        <button class="btn ghost sm" data-x="pass" data-id="${s.id}">Şifre sıfırla</button><button class="btn ghost sm" data-x="member" data-id="${s.id}">Hesap ekle</button>
        <button class="btn ghost sm" data-x="edit" data-id="${s.id}">Düzenle</button><button class="btn ghost sm" data-x="toggle" data-id="${s.id}" data-on="${s.active ? 0 : 1}">${s.active ? 'Durdur' : 'Aç'}</button></div>`}` : ''}
  </div><button class="btn ghost sm" data-x="open" data-id="${s.id}" aria-label="${open ? 'Kapat' : 'Aç'}">${open ? '−' : '+'}</button></div>`;
}
function bindShopItems() {
  const $ = id => document.getElementById(id);
  const act = async (fnc, ok) => { try { await fnc(); toast(ok); S.mode = null; await load(); render(); } catch (e) { toast(e.message || 'İşlem yapılamadı.'); } };
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
    if (x === 'extendGo') return act(() => q(() => SB.rpc('p_extend', { p_shop: id, p_years: Number($('xY').value), p_amount: Number($('xA').value) || 0, p_note: '' }), 1), 'Ödeme kaydedildi, süre uzatıldı');
    if (x === 'passGo') return act(async () => { const email = $('rE').value, password = $('rP').value; await fn({ action: 'reset_password', email, password }); copyText(`Yeni Berberim şifren: ${password}\nE-posta: ${email}\nGiriş: ${panelUrl()}`); }, 'Şifre değişti, bilgiler kopyalandı');
    if (x === 'memberGo') return act(() => fn({ action: 'add_member', shop_id: id, email: $('mE').value.trim(), password: $('mP').value }), 'Hesap eklendi');
    if (x === 'editGo') return act(() => q(() => SB.rpc('p_update_shop', { p_shop: id, p_name: $('eN').value.trim(), p_slug: $('eS').value.trim().toLowerCase(), p_note: $('eNo').value, p_paid_until: $('eU').value }), 1), 'Kaydedildi');
  });
}

function tabPay() {
  const now = new Date(), months = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1), k = d.getFullYear() + '-' + pad(d.getMonth() + 1); months.push({ label: MONTHS[d.getMonth()].slice(0, 1), value: S.payments.filter(p => String(p.paid_on).startsWith(k)).reduce((a, p) => a + Number(p.amount), 0), hl: i === 0 }); }
  const total = S.payments.reduce((a, p) => a + Number(p.amount), 0);
  app.innerHTML = `<header class="head"><h1>Ödemeler</h1><p>Toplam ${tl(total)}</p></header>
  <section class="sec"><h2>Son 12 ay</h2><div class="card">${barChart(months, { aria: 'Son 12 ay abonelik gelirleri', short: tlShort, fmt: tl })}</div></section>
  <section class="sec"><h2>Tüm ödemeler</h2><div class="card"><div class="list">${S.payments.map(p => `<div class="item"><div class="main"><div><b>${esc(p.shop)}</b></div><div class="muted small">${esc(fmtDs(p.paid_on))} · ${p.years} yıl${p.note ? ' · ' + esc(p.note) : ''}</div></div><b class="money">${tl(p.amount)}</b></div>`).join('') || '<p class="empty">Henüz ödeme kaydı yok.</p>'}</div></div></section>`;
}

function tabSettings() {
  const st = S.settings;
  app.innerHTML = `<header class="head"><h1>Ayarlar</h1></header>
  <section class="sec"><p class="muted">Süresi biten berbere bu isim ve telefon gösterilir, "yenilemek için yaz" düğmesi buraya gelir.</p>
    <label for="sN">Adın<input id="sN" value="${esc(st.seller_name)}"></label>
    <label for="sP">WhatsApp numaran<input id="sP" type="tel" value="${esc(st.seller_phone)}" placeholder="05xx xxx xx xx"></label>
    <label for="sY">Yıllık fiyat (₺)<input id="sY" type="number" inputmode="numeric" value="${st.yearly_price}"></label>
    <button class="btn" id="sv">Kaydet</button></section>
  <a class="btn ghost" href="/panel/">Berber paneline geç</a>
  <button class="btn ghost" id="lo">Çıkış yap</button>`;
  document.getElementById('lo').onclick = logout;
  document.getElementById('sv').onclick = async () => {
    try { await q(() => SB.rpc('p_save_settings', { p_name: document.getElementById('sN').value, p_phone: document.getElementById('sP').value, p_price: Number(document.getElementById('sY').value) || 0 }), 1); await load(); toast('Kaydedildi'); render(); }
    catch (e) { toast('Kaydedilemedi.'); }
  };
}

boot();
