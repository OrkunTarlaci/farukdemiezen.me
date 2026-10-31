// OTOMATİK ÜRETİLDİ — ELLE DÜZENLEMEYİN. Kaynak: supabase/functions/send-notifications/ (npm run bundle:functions)
// Supabase Dashboard → Edge Functions → "send-notifications" → index.ts içine bu dosyanın TAMAMINI yapıştırın.
// Gizli değerler bu dosyada YOKTUR; Edge Functions → Secrets bölümünden okunur.
// supabase/functions/send-notifications/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// supabase/functions/_shared/http.ts
function parseList(v) {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
function corsHeaders(origin, allowed) {
  const allowOrigin = allowed.length === 0 ? "*" : origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}
function originAllowed(origin, allowed) {
  return allowed.length === 0 || origin !== null && allowed.includes(origin);
}

// supabase/functions/_shared/notifications.ts
var TZ = "Europe/Istanbul";
function dateTr(iso) {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}
function timeTr(iso) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}.${get("minute")}`;
}
function priceTr(minor) {
  if (minor == null) return null;
  const major = minor / 100;
  return `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: Number.isInteger(major) ? 0 : 2, maximumFractionDigits: 2 }).format(major)} TL`;
}
function renderMessage(kind, d) {
  const head = `${d.businessName}:`;
  const when = `${dateTr(d.startsAt)} saat ${timeTr(d.startsAt)}`;
  const price = priceTr(d.priceMinor);
  const contact = d.contactPhone ? ` Bilgi: ${d.contactPhone}` : "";
  switch (kind) {
    case "booking_received":
      return `${head} Randevu talebiniz alındı. Hizmet: ${d.serviceName}. Tarih: ${dateTr(d.startsAt)}. Saat: ${timeTr(d.startsAt)}.${price ? ` Fiyat: ${price}.` : ""} Talebiniz işletme onayından sonra kesinleşir. Ref: ${d.referenceCode}`;
    case "confirmed":
      return `${head} Randevunuz onaylandı. ${d.serviceName}, ${when}. Ref: ${d.referenceCode}`;
    case "cancelled":
      return `${head} ${when} tarihli randevunuz iptal edildi.${contact} Ref: ${d.referenceCode}`;
    case "rescheduled":
      return `${head} Randevunuz ${when} olarak güncellendi. Hizmet: ${d.serviceName}. Ref: ${d.referenceCode}`;
  }
}
var disabledProvider = {
  name: "none",
  configured: false,
  send: async () => ({ ok: false, error: "provider_not_configured", retryable: false })
};
async function processNotifications(deps2, appointmentId) {
  const summary = { sent: 0, failed: 0, skipped: 0 };
  const items = await deps2.claim(appointmentId);
  for (const n of items) {
    try {
      if (!deps2.provider.configured) {
        await deps2.finish(n.id, "skipped", deps2.provider.name, null, "provider_not_configured");
        summary.skipped++;
        continue;
      }
      const target = await deps2.load(n.appointment_id);
      if (!target) {
        await deps2.finish(n.id, "skipped", deps2.provider.name, null, "appointment_not_found");
        summary.skipped++;
        continue;
      }
      const result = await deps2.provider.send(target.phone, renderMessage(n.kind, target.data));
      if (result.ok) {
        await deps2.finish(n.id, "sent", deps2.provider.name, result.messageId, null);
        summary.sent++;
      } else {
        await deps2.finish(n.id, "failed", deps2.provider.name, null, result.error);
        summary.failed++;
      }
    } catch (e) {
      await deps2.finish(n.id, "failed", deps2.provider.name, null, `exception:${e?.name ?? "Error"}`).catch(() => void 0);
      summary.failed++;
    }
  }
  return summary;
}

// supabase/functions/_shared/notificationDeps.ts
function selectProvider(name) {
  switch ((name ?? "none").toLowerCase()) {
    default:
      return disabledProvider;
  }
}
function createNotificationDeps(admin2, provider2) {
  return {
    provider: provider2,
    claim: async (appointmentId) => {
      const { data, error } = await admin2.rpc("claim_notifications", { p_appointment: appointmentId, p_limit: 20 });
      if (error) throw new Error("claim_failed");
      return data ?? [];
    },
    load: async (appointmentId) => {
      const [{ data: a }, { data: s }] = await Promise.all([
        admin2.from("appointments").select("customer_phone, service_name, starts_at, price_minor, reference_code, services(name)").eq("id", appointmentId).maybeSingle(),
        admin2.from("business_settings").select("business_name, contact_phone").eq("id", 1).maybeSingle()
      ]);
      if (!a) return null;
      const row = a;
      return {
        phone: row.customer_phone,
        data: {
          businessName: s?.business_name ?? "Randevu",
          contactPhone: s?.contact_phone ?? null,
          serviceName: row.service_name ?? row.services?.name ?? "Hizmet",
          startsAt: row.starts_at,
          priceMinor: row.price_minor,
          referenceCode: row.reference_code
        }
      };
    },
    finish: async (id, status, providerName, messageId, error) => {
      await admin2.rpc("finish_notification", {
        p_id: id,
        p_status: status,
        p_provider: providerName,
        p_message_id: messageId,
        p_error: error
      });
    }
  };
}

// supabase/functions/send-notifications/handler.ts
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function handleSendRequest(req, deps2) {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin, deps2.allowedOrigins);
  const json = (status, body2) => new Response(JSON.stringify(body2), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "invalid_request" });
  if (!originAllowed(origin, deps2.allowedOrigins)) return json(403, { error: "forbidden" });
  let admin2 = false;
  try {
    admin2 = await deps2.isAdmin(req.headers.get("authorization"));
  } catch {
    admin2 = false;
  }
  if (!admin2) return json(403, { error: "forbidden" });
  let body = {};
  try {
    body = JSON.parse(await req.text() || "{}");
  } catch {
    return json(400, { error: "invalid_request" });
  }
  const provider2 = { name: deps2.provider.name, configured: deps2.provider.configured };
  if (body.statusOnly === true) return json(200, { provider: provider2 });
  const appointmentId = typeof body.appointmentId === "string" && UUID_RE.test(body.appointmentId) ? body.appointmentId : null;
  if (body.appointmentId !== void 0 && appointmentId === null) return json(400, { error: "invalid_request" });
  try {
    const summary = await deps2.process(appointmentId);
    return json(200, { provider: provider2, summary });
  } catch {
    return json(503, { error: "try_again" });
  }
}

// supabase/functions/send-notifications/index.ts
var url = Deno.env.get("SUPABASE_URL") ?? "";
var anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
var admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false }
});
var provider = selectProvider(Deno.env.get("SMS_PROVIDER"));
var deps = createNotificationDeps(admin, provider);
Deno.serve(
  (req) => handleSendRequest(req, {
    provider,
    allowedOrigins: parseList(Deno.env.get("ALLOWED_ORIGINS")),
    isAdmin: async (authorization) => {
      if (!authorization?.startsWith("Bearer ")) return false;
      const asUser = createClient(url, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data, error } = await asUser.rpc("is_admin");
      return !error && data === true;
    },
    process: (appointmentId) => processNotifications(deps, appointmentId)
  })
);
