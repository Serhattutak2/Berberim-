# Berberim

M&G Barbers için online randevu ve berber paneli.

- `/` — müşteri randevu sayfası (fiyat göstermez)
- `/panel/` — berber paneli (giriş gerekir; randevular, müşteriler, gelir–gider, ayarlar, sesli komut)

Yapı: statik site (Render) + Supabase (Postgres, giriş, satır düzeyi güvenlik).
Veritabanı şeması: `supabase/schema.sql`. Müşteriler tablolara doğrudan erişemez; sadece
`busy_slots`, `book`, `my_appts`, `cancel_appt` fonksiyonlarını çağırabilir. Fiyat ve gelir
bilgisi yalnızca yönetici hesabına açıktır.
