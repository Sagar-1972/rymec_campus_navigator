export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) {
    return res.status(503).json({ ok: false, error: "ADMIN_PASSWORD is not configured" });
  }

  const password = req.body && req.body.password;
  if (typeof password !== "string" || password !== configured) {
    return res.status(401).json({ ok: false });
  }

  return res.status(200).json({ ok: true });
}
