// Patron (satıcı) işlemleri: abone (dükkan + berber hesabı) açma, hesap ekleme, şifre sıfırlama.
// Berberler e-posta yerine kullanıcı adıyla girer; arka planda kullanici@uye.berberim.app hesabı açılır (e-posta gönderilmez).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOMAIN = "uye.berberim.app";

const slugOk = (s: string) => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s);
const userOk = (s: string) => /^[a-z0-9][a-z0-9._-]{2,30}$/.test(s);
const toEmail = (login: string) => {
  const l = login.trim().toLowerCase();
  return l.includes("@") ? l : `${l}@${DOMAIN}`;
};

async function findUser(admin: any, email: string) {
  const { data } = await admin.rpc("svc_user_id", { p_email: email });
  return (data as string) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    const caller = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
    const { data: isSuper, error: se } = await caller.rpc("is_super");
    if (se || !isSuper) return json({ error: "YETKI" }, 403);

    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "create_shop") {
      const slug = String(body.slug || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      const owner = String(body.owner || "").trim().slice(0, 80);
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      const phone = String(body.phone || "").trim().slice(0, 25);
      const months = Math.min(60, Math.max(1, Math.round(Number(body.months) || 12)));
      const amount = Math.max(0, Number(body.amount) || 0);
      if (!slugOk(slug)) return json({ error: "LINK" }, 400);
      if (name.length < 2 || name.length > 60) return json({ error: "AD" }, 400);
      if (!userOk(username)) return json({ error: "KULLANICI" }, 400);
      if (password.length < 6) return json({ error: "SIFRE_KISA" }, 400);
      const { data: taken } = await admin.from("shops").select("id").eq("slug", slug).maybeSingle();
      if (taken) return json({ error: "LINK_DOLU" }, 400);
      const email = toEmail(username);
      if (await findUser(admin, email)) return json({ error: "KULLANICI_DOLU" }, 400);
      const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: owner } });
      if (ue || !u.user) throw new Error("HESAP: " + (ue?.message || ""));
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
      const until = new Date(now); until.setMonth(until.getMonth() + months);
      const paid_until = `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, "0")}-${String(until.getDate()).padStart(2, "0")}`;
      const { data: shop, error: e1 } = await admin.from("shops")
        .insert({ slug, name, owner_name: owner, phone, paid_until, note: String(body.note || "").slice(0, 200) }).select("id").single();
      if (e1) { await admin.auth.admin.deleteUser(u.user.id); throw new Error("DUKKAN: " + e1.message); }
      await admin.from("members").insert({ shop_id: shop.id, user_id: u.user.id });
      await admin.from("payments").insert({ shop_id: shop.id, amount, years: 0, months, note: "İlk kayıt" });
      return json({ ok: true, shop_id: shop.id, paid_until });
    }

    if (action === "add_member") {
      const login = String(body.username || "").trim().toLowerCase();
      if (!login.includes("@") && !userOk(login)) return json({ error: "KULLANICI" }, 400);
      const email = toEmail(login);
      let uid = await findUser(admin, email);
      if (!uid) {
        const password = String(body.password || "");
        if (password.length < 6) return json({ error: "SIFRE_KISA" }, 400);
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error || !data.user) throw new Error("HESAP: " + (error?.message || ""));
        uid = data.user.id;
      }
      const { error } = await admin.from("members").upsert({ shop_id: body.shop_id, user_id: uid });
      if (error) throw new Error("UYE: " + error.message);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const password = String(body.password || "");
      if (password.length < 6) return json({ error: "SIFRE_KISA" }, 400);
      const uid = await findUser(admin, toEmail(String(body.username || "")));
      if (!uid) return json({ error: "BULUNAMADI" }, 400);
      const { error } = await admin.auth.admin.updateUserById(uid, { password, email_confirm: true });
      if (error) throw new Error("SIFRE: " + error.message);
      return json({ ok: true });
    }

    return json({ error: "ISLEM" }, 400);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return json({ error: "HATA", detail: m }, 400);
  }
});
