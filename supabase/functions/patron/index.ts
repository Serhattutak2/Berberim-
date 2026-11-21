// Patron (satıcı) işlemleri: dükkan + berber hesabı açma, berber ekleme, şifre sıfırlama.
// Sadece super_admins tablosundaki kullanıcı çağırabilir.
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

const slugOk = (s: string) => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s);
const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

async function ensureUser(admin: ReturnType<typeof createClient>, email: string, password?: string) {
  const { data: existing } = await admin.rpc("svc_user_id", { p_email: email });
  if (existing) {
    if (password) {
      const { error } = await admin.auth.admin.updateUserById(existing as string, { password, email_confirm: true });
      if (error) throw new Error("SIFRE: " + error.message);
    }
    return { id: existing as string, created: false };
  }
  if (!password || password.length < 8) throw new Error("SIFRE_KISA");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error("HESAP: " + (error?.message || ""));
  return { id: data.user.id, created: true };
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
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const phone = String(body.phone || "").trim().slice(0, 25);
      const years = Math.min(10, Math.max(1, Number(body.years) || 1));
      const amount = Math.max(0, Number(body.amount) || 0);
      if (!slugOk(slug)) return json({ error: "LINK" }, 400);
      if (name.length < 2 || name.length > 60) return json({ error: "AD" }, 400);
      if (!emailOk(email)) return json({ error: "EPOSTA" }, 400);
      const { data: taken } = await admin.from("shops").select("id").eq("slug", slug).maybeSingle();
      if (taken) return json({ error: "LINK_DOLU" }, 400);
      const user = await ensureUser(admin, email, password || undefined);
      const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
      const until = new Date(today); until.setFullYear(until.getFullYear() + years);
      const paid_until = until.toISOString().slice(0, 10);
      const { data: shop, error: e1 } = await admin.from("shops")
        .insert({ slug, name, phone, paid_until, note: String(body.note || "").slice(0, 200) }).select("id").single();
      if (e1) throw new Error("DUKKAN: " + e1.message);
      const { error: e2 } = await admin.from("members").insert({ shop_id: shop.id, user_id: user.id });
      if (e2) throw new Error("UYE: " + e2.message);
      if (amount > 0 || body.record_payment) {
        await admin.from("payments").insert({ shop_id: shop.id, amount, years, note: "İlk kayıt" });
      }
      return json({ ok: true, shop_id: shop.id, paid_until, user_created: user.created });
    }

    if (action === "add_member") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!emailOk(email)) return json({ error: "EPOSTA" }, 400);
      const user = await ensureUser(admin, email, body.password ? String(body.password) : undefined);
      const { error } = await admin.from("members").upsert({ shop_id: body.shop_id, user_id: user.id });
      if (error) throw new Error("UYE: " + error.message);
      return json({ ok: true, user_created: user.created });
    }

    if (action === "remove_member") {
      const { data: uid } = await admin.rpc("svc_user_id", { p_email: String(body.email || "") });
      if (!uid) return json({ error: "BULUNAMADI" }, 400);
      await admin.from("members").delete().eq("shop_id", body.shop_id).eq("user_id", uid);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (password.length < 8) return json({ error: "SIFRE_KISA" }, 400);
      const { data: uid } = await admin.rpc("svc_user_id", { p_email: email });
      if (!uid) return json({ error: "BULUNAMADI" }, 400);
      const { error } = await admin.auth.admin.updateUserById(uid as string, { password, email_confirm: true });
      if (error) throw new Error("SIFRE: " + error.message);
      return json({ ok: true });
    }

    return json({ error: "ISLEM" }, 400);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return json({ error: m.startsWith("SIFRE_KISA") ? "SIFRE_KISA" : "HATA", detail: m }, 400);
  }
});
