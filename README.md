# Berberim

Berberler için online randevu ve kasa defteri. Her berberin kendi linki ve paneli vardır; satıcı (patron) abonelikleri yönetir.

- `/?dukkan-linki` — müşteri randevu sayfası (fiyat göstermez). Link yoksa ürün tanıtım sayfası açılır.
- `/panel/` — berber paneli: bugün, müşteriler, kasa (gelir–gider grafikleri), ayarlar, sesli kayıt
- `/patron/` — satıcı paneli: berber ekle, yıl uzat, ödemeler, durdur/aç, şifre sıfırla

Altyapı: statik site (Render) + Supabase (Postgres, giriş, satır düzeyi güvenlik, `patron` edge function).
Müşteriler tablolara doğrudan erişemez; sadece `b_*` fonksiyonlarını çağırabilir. Berber sadece kendi
dükkanının verisini, aboneliği geçerliyse görebilir. Patron berberlerin randevu/kasa verisini görmez.
