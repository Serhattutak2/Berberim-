/* Berberim tanıtım: canlı demo + başvuru */
(function demo() {
  const scenes = [...document.querySelectorAll('.scene')], cap = document.getElementById('cap'), prog = document.getElementById('prog');
  const CAPS = ['Müşteri WhatsApp\'tan yazar, randevu linki otomatik gider.', 'Linke dokunur; hizmeti, günü ve boş saati seçer.', 'Randevusu anında alınır. Dolu saat kimseye verilmez.', 'Sen panelden "Geldi" dersin; kasa kendiliğinden işlenir.'];
  const DUR = [4200, 5200, 3000, 5200];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = -1, timer = null, playing = !reduce, sub = [];
  prog.innerHTML = scenes.map((_, k) => `<button aria-label="Adım ${k + 1}" data-k="${k}"><i></i></button>`).join('') + `<button class="pp" id="pp">${playing ? 'Durdur' : 'Oynat'}</button>`;
  const bars = [...prog.querySelectorAll('[data-k] i')];
  const clear = () => { sub.forEach(clearTimeout); sub = []; clearTimeout(timer); };
  const at = (ms, f) => sub.push(setTimeout(f, ms));
  function reset(k) {
    const s = scenes[k];
    s.querySelectorAll('.bub').forEach(b => b.classList.remove('show'));
    const ps = document.getElementById('pickSlot'); ps && ps.classList.remove('pick');
    const tn = document.getElementById('typeName'); if (tn) { tn.textContent = 'Adınız ve soyadınız'; tn.style.color = ''; }
    const g = document.getElementById('mGeldi'); if (g) { g.textContent = 'Geldi'; g.className = ''; }
    const kn = document.getElementById('kasaNum'); if (kn) kn.textContent = '2.400 ₺';
    const mic = document.getElementById('mMic'); if (mic) { mic.textContent = '🎤 Konuşarak kaydet'; mic.classList.remove('rec'); }
  }
  function animate(k) {
    if (k === 0) { const b = scenes[0].querySelectorAll('.bub'); at(300, () => b[0].classList.add('show')); at(1500, () => b[1].classList.add('show')); }
    if (k === 1) {
      at(1200, () => document.getElementById('pickSlot').classList.add('pick'));
      const name = 'Mehmet Kaya', tn = document.getElementById('typeName');
      for (let c = 1; c <= name.length; c++) at(1900 + c * 90, () => { tn.textContent = name.slice(0, c); tn.style.color = '#15181f'; });
      at(4300, () => document.getElementById('okBtn').classList.add('tap')); at(4500, () => document.getElementById('okBtn').classList.remove('tap'));
    }
    if (k === 3) {
      const g = document.getElementById('mGeldi'), kn = document.getElementById('kasaNum'), mic = document.getElementById('mMic');
      at(1200, () => { g.className = 'ok'; let v = 2400; const step = () => { v += 50; kn.textContent = v.toLocaleString('tr-TR') + ' ₺'; if (v < 3000) at(30, step); }; step(); });
      at(2800, () => { mic.classList.add('rec'); mic.textContent = '"Saat 3 buçukta Emre geldi 500"'; });
      at(4600, () => { mic.classList.remove('rec'); mic.textContent = '✓ 15:30 Emre Şahin: geldi, 500 ₺'; });
    }
  }
  function go(k) {
    clear(); i = k;
    scenes.forEach((s, n) => s.classList.toggle('on', n === k));
    reset(k); cap.textContent = CAPS[k];
    bars.forEach((b, n) => { b.style.transition = 'none'; b.parentElement.classList.toggle('done', n < k); b.style.transform = n < k ? 'scaleX(1)' : 'scaleX(0)'; });
    if (playing) {
      animate(k);
      requestAnimationFrame(() => { bars[k].style.transition = `transform ${DUR[k]}ms linear`; bars[k].style.transform = 'scaleX(1)'; });
      timer = setTimeout(() => go((k + 1) % scenes.length), DUR[k]);
    } else { bars[k].style.transform = 'scaleX(1)'; }
  }
  prog.querySelectorAll('[data-k]').forEach(b => b.onclick = () => go(Number(b.dataset.k)));
  document.getElementById('pp').onclick = e => { playing = !playing; e.target.textContent = playing ? 'Durdur' : 'Oynat'; go(i < 0 ? 0 : i); };
  // Ekranda değilken oynatmayı beklet (pil ve hız için)
  const ph = document.querySelector('.phone');
  if ('IntersectionObserver' in window && !reduce) {
    let seen = false;
    new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting && !seen) { seen = true; go(0); } else if (!en.isIntersecting && seen && playing) { clear(); } else if (en.isIntersecting && seen && playing) go(i); }), { threshold: .3 }).observe(ph);
    scenes[0].classList.add('on'); cap.textContent = CAPS[0];
  } else go(0);
})();

(async function info() {
  let s = null; try { s = await q(() => SB.rpc('seller_info'), 2); } catch (e) {}
  if (!s) return;
  if (s.price) { document.getElementById('priceAmt').textContent = Number(s.price).toLocaleString('tr-TR') + ' ₺'; document.getElementById('pricePer').textContent = 'ayda yaklaşık ' + Math.round(s.price / 12).toLocaleString('tr-TR') + ' ₺'; }
  if (s.phone) {
    const wa = 'https://wa.me/' + waNum(s.phone) + '?text=' + encodeURIComponent('Merhaba, Berberim hakkında bilgi almak istiyorum.');
    const t = document.getElementById('waTop'); t.href = wa; t.target = '_blank'; t.rel = 'noopener';
    document.getElementById('sellerLine').innerHTML = `Hemen konuşmak istersen: <a href="${wa}" target="_blank" rel="noopener">${esc(s.name)} · ${esc(s.phone)}</a>`;
  }
})();

document.getElementById('form').addEventListener('submit', async e => {
  e.preventDefault();
  const $ = id => document.getElementById(id), err = $('fErr'), btn = $('fGo');
  const shop = $('fShop').value.trim(), name = $('fName').value.trim(), phone = $('fPhone').value.trim();
  const fail = (m, el) => { err.textContent = m; err.hidden = false; el && el.focus(); };
  if (shop.length < 2) return fail('Dükkan adını yaz.', $('fShop'));
  if (name.length < 2) return fail('Adını ve soyadını yaz.', $('fName'));
  if (digits(phone).length < 10) return fail('Telefon numarası en az 10 haneli olmalı.', $('fPhone'));
  err.hidden = true; btn.disabled = true; btn.textContent = 'Gönderiliyor…';
  try {
    await q(() => SB.rpc('b_apply', { p_shop: shop, p_person: name, p_phone: phone, p_city: $('fCity').value.trim(), p_note: $('fNote').value.trim() }), 2);
    $('form').outerHTML = `<div class="ok-box">Başvurun alındı, teşekkürler ${esc(name.split(' ')[0])}. En kısa sürede ${esc(phone)} numarasından seni arayacağız.</div>`;
  } catch (x) {
    btn.disabled = false; btn.textContent = 'Başvuruyu gönder';
    fail(/COK/.test(x.message || '') ? 'Bu numarayla bugün zaten başvuru yapılmış, seni arayacağız.' : 'Gönderilemedi, internetini kontrol edip tekrar dene.');
  }
});
