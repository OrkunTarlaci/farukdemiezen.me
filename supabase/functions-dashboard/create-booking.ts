// OTOMATİK ÜRETİLDİ — ELLE DÜZENLEMEYİN. Kaynak: supabase/functions/create-booking/ (npm run bundle:functions)
// Supabase Dashboard → Edge Functions → "create-booking" → index.ts içine bu dosyanın TAMAMINI yapıştırın.
// Gizli değerler bu dosyada YOKTUR; Edge Functions → Secrets bölümünden okunur.
// supabase/functions/create-booking/index.ts
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
function misconfiguredResponse(req, allowed, code) {
  const cors = corsHeaders(req.headers.get("origin"), allowed);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  return new Response(JSON.stringify({ error: code }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
}

// supabase/functions/_shared/keys.ts
function fromJsonDict(raw) {
  if (!raw) return null;
  try {
    const dict = JSON.parse(raw);
    if (!dict || typeof dict !== "object") return null;
    const preferred = dict.default;
    if (typeof preferred === "string" && preferred.trim()) return preferred.trim();
    const first = Object.values(dict).find((v) => typeof v === "string" && v.trim() !== "");
    return first?.trim() ?? null;
  } catch {
    return null;
  }
}
function plain(raw) {
  const v = raw?.trim();
  return v ? v : null;
}
function resolveServerKey(env2) {
  const fresh = fromJsonDict(env2("SUPABASE_SECRET_KEYS"));
  if (fresh) return { key: fresh, source: "secret_keys" };
  const legacy = plain(env2("SUPABASE_SERVICE_ROLE_KEY"));
  if (legacy) return { key: legacy, source: "service_role" };
  return null;
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
async function processNotifications(deps, appointmentId) {
  const summary = { sent: 0, failed: 0, skipped: 0 };
  const items = await deps.claim(appointmentId);
  for (const n of items) {
    try {
      if (!deps.provider.configured) {
        await deps.finish(n.id, "skipped", deps.provider.name, null, "provider_not_configured");
        summary.skipped++;
        continue;
      }
      const target = await deps.load(n.appointment_id);
      if (!target) {
        await deps.finish(n.id, "skipped", deps.provider.name, null, "appointment_not_found");
        summary.skipped++;
        continue;
      }
      const result = await deps.provider.send(target.phone, renderMessage(n.kind, target.data));
      if (result.ok) {
        await deps.finish(n.id, "sent", deps.provider.name, result.messageId, null);
        summary.sent++;
      } else {
        await deps.finish(n.id, "failed", deps.provider.name, null, result.error);
        summary.failed++;
      }
    } catch (e) {
      await deps.finish(n.id, "failed", deps.provider.name, null, `exception:${e?.name ?? "Error"}`).catch(() => void 0);
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
function createNotificationDeps(admin, provider) {
  return {
    provider,
    claim: async (appointmentId) => {
      const { data, error } = await admin.rpc("claim_notifications", { p_appointment: appointmentId, p_limit: 20 });
      if (error) throw new Error("claim_failed");
      return data ?? [];
    },
    load: async (appointmentId) => {
      const [{ data: a }, { data: s }] = await Promise.all([
        admin.from("appointments").select("customer_phone, service_name, starts_at, price_minor, reference_code, services(name)").eq("id", appointmentId).maybeSingle(),
        admin.from("business_settings").select("business_name, contact_phone").eq("id", 1).maybeSingle()
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
      await admin.rpc("finish_notification", {
        p_id: id,
        p_status: status,
        p_provider: providerName,
        p_message_id: messageId,
        p_error: error
      });
    }
  };
}

// supabase/functions/create-booking/handler.ts
var TURNSTILE_ACTION = "booking";
var MAX_BODY_BYTES = 8e3;
var DEFAULT_TEST_HOSTNAMES = ["localhost", "127.0.0.1"];
var DB_ERRORS = {
  slot_unavailable: 409,
  slot_invalid: 400,
  too_soon: 400,
  service_unavailable: 400,
  invalid_name: 400,
  invalid_phone: 400,
  invalid_email: 400,
  invalid_note: 400,
  too_many_bookings: 429,
  not_configured: 503,
  try_again: 503
};
function clientIpFrom(headers) {
  const v = headers.get("cf-connecting-ip")?.trim() || headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  return v ? v.slice(0, 64) : null;
}
var isStr = (v, max) => typeof v === "string" && v.length <= max;
var isOptStr = (v, max) => v === void 0 || v === null || isStr(v, max);
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseBookingRequest(body) {
  if (!body || typeof body !== "object") return "invalid_request";
  const b = body;
  if (b.captchaToken === void 0 || b.captchaToken === null || b.captchaToken === "") return "captcha_required";
  if (!isStr(b.serviceId, 36) || !UUID_RE.test(b.serviceId) || !isStr(b.startsAt, 40) || Number.isNaN(Date.parse(b.startsAt)) || !isStr(b.firstName, 200) || !isStr(b.lastName, 200) || !isStr(b.phone, 40) || !isOptStr(b.email, 254) || !isOptStr(b.note, 1e3) || !isStr(b.captchaToken, 2048)) {
    return "invalid_request";
  }
  return {
    serviceId: b.serviceId,
    startsAt: b.startsAt,
    firstName: b.firstName,
    lastName: b.lastName,
    phone: b.phone,
    email: b.email || null,
    note: b.note || null,
    captchaToken: b.captchaToken
  };
}
async function verifyTurnstileWithCloudflare(secret, token, remoteIp, fetchImpl = fetch) {
  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp) form.set("remoteip", remoteIp);
  const res = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  if (!res.ok) throw new Error(`siteverify HTTP ${res.status}`);
  return await res.json();
}
async function handleRequest(req, deps) {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin, deps.allowedOrigins);
  const json = (status, body2) => new Response(JSON.stringify(body2), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const fail = (status, code) => {
    deps.log?.({ status, code });
    return json(status, { error: code });
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return fail(405, "invalid_request");
  if (deps.allowedOrigins.length > 0 && (!origin || !deps.allowedOrigins.includes(origin))) {
    return fail(403, "forbidden");
  }
  if (!deps.captchaConfigured) return fail(503, "captcha_not_configured");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return fail(413, "invalid_request");
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return fail(413, "invalid_request");
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "invalid_request");
  }
  const input = parseBookingRequest(body);
  if (input === "invalid_request") return fail(400, "invalid_request");
  if (input === "captcha_required") return fail(400, "captcha_required");
  const ip = clientIpFrom(req.headers);
  try {
    if (!await deps.bookingRateLimitHit(ip)) return fail(429, "rate_limited");
  } catch {
    return fail(503, "try_again");
  }
  let captcha;
  try {
    captcha = await deps.verifyTurnstile(input.captchaToken, ip);
  } catch {
    return fail(503, "captcha_unavailable");
  }
  const hostnameOk = deps.allowedHostnames.length === 0 || captcha.hostname !== void 0 && deps.allowedHostnames.includes(captcha.hostname);
  if (!captcha.success || captcha.action !== TURNSTILE_ACTION || !hostnameOk) {
    return fail(403, "captcha_failed");
  }
  const isTest = captcha.hostname !== void 0 && (deps.testHostnames ?? DEFAULT_TEST_HOSTNAMES).includes(captcha.hostname);
  const { data, error } = await deps.createAppointment({
    p_service_id: input.serviceId,
    p_starts_at: input.startsAt,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_phone: input.phone,
    p_email: input.email,
    p_note: input.note,
    p_is_test: isTest
  });
  if (error) {
    const code = (error.message ?? "").trim();
    if (Object.prototype.hasOwnProperty.call(DB_ERRORS, code)) return fail(DB_ERRORS[code], code);
    return fail(500, "try_again");
  }
  const { id, ...result } = data ?? {};
  if (id && deps.afterBooking) {
    try {
      await deps.afterBooking(id);
    } catch {
    }
  }
  deps.log?.({ status: 200, code: result.is_test ? "booked_test" : "booked" });
  return json(200, result);
}

// supabase/functions/create-booking/index.ts
var env = (name) => Deno.env.get(name);
var url = env("SUPABASE_URL") ?? "";
var serverKey = resolveServerKey(env);
var allowedOrigins = parseList(env("ALLOWED_ORIGINS"));
var log = (event) => console.log(JSON.stringify({ fn: "create-booking", ...event }));
if (!url || !serverKey) {
  log({ status: 503, code: "server_not_configured", hint: "SUPABASE_URL veya sunucu anahtarı (SUPABASE_SECRET_KEYS / SUPABASE_SERVICE_ROLE_KEY) bulunamadı" });
  Deno.serve((req) => misconfiguredResponse(req, allowedOrigins, "server_not_configured"));
} else {
  log({ status: 0, code: "started", key_source: serverKey.source });
  const secret = env("TURNSTILE_SECRET_KEY") ?? "";
  const admin = createClient(url, serverKey.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const notificationDeps = createNotificationDeps(admin, selectProvider(env("SMS_PROVIDER")));
  const testHostnames = parseList(env("TEST_HOSTNAMES"));
  Deno.serve(
    (req) => handleRequest(req, {
      captchaConfigured: secret !== "",
      verifyTurnstile: (token, ip) => verifyTurnstileWithCloudflare(secret, token, ip),
      bookingRateLimitHit: async (ip) => {
        const { data, error } = await admin.rpc("booking_rate_limit_hit", { p_client_ip: ip });
        if (error) throw error;
        return data === true;
      },
      createAppointment: async (args) => {
        const { data, error } = await admin.rpc("create_appointment", args);
        return { data, error: error ? { message: error.message } : null };
      },
      allowedOrigins,
      allowedHostnames: parseList(env("TURNSTILE_ALLOWED_HOSTNAMES")),
      testHostnames: testHostnames.length ? testHostnames : DEFAULT_TEST_HOSTNAMES,
      // SMS, yanıtı geciktirmemek için arka planda gönderilir; hatası randevuyu etkilemez.
      afterBooking: async (appointmentId) => {
        const job = processNotifications(notificationDeps, appointmentId).catch(() => void 0);
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
        else await job;
      },
      log: ({ status, code }) => log({ status, code })
    })
  );
}
