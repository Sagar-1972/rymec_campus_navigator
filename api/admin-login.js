import crypto from 'node:crypto';

// Simple in-memory rate limiter for admin login attempts
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + WINDOW_MS;
  }
  record.count++;
  loginAttempts.set(ip, record);
  return record.count <= MAX_ATTEMPTS;
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ ok: false, error: "Too many login attempts. Please try again later." });
  }

  // Works immediately after deployment. For production, set ADMIN_PASSWORD in Vercel.
  const configuredPassword = process.env.ADMIN_PASSWORD || "admin123";
  const configuredUsername = process.env.ADMIN_USERNAME || "admin";

  if (!configuredPassword) {
    return res.status(503).json({ ok: false, error: "ADMIN_PASSWORD is not configured" });
  }

  const body = req.body || {};
  const username = body.username;
  const password = body.password;

  if (typeof username !== "string" || typeof password !== "string" ||
      username !== configuredUsername || password !== configuredPassword) {
    return res.status(401).json({ ok: false });
  }

  const ts = Date.now();
  const token = `${ts}.${crypto.createHmac('sha256', configuredPassword).update(String(ts)).digest('hex')}`;
  return res.status(200).json({ ok: true, token });
}
