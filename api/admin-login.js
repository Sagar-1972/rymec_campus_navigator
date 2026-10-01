import crypto from 'node:crypto';

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
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
