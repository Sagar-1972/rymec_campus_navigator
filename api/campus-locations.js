import { put, list } from '@vercel/blob';
import crypto from 'node:crypto';

const PATH = 'campus/locations.json';

function makeToken() {
  const ts = Date.now();
  const secret = process.env.ADMIN_PASSWORD;
  const sig = crypto.createHmac('sha256', secret).update(String(ts)).digest('hex');
  return `${ts}.${sig}`;
}

function validToken(token) {
  try {
    const [ts, sig] = String(token || '').split('.');
    if (!ts || !sig || !process.env.ADMIN_PASSWORD) return false;
    const age = Date.now() - Number(ts);
    if (!Number.isFinite(age) || age < 0 || age > 12 * 60 * 60 * 1000) return false;
    const expected = crypto.createHmac('sha256', process.env.ADMIN_PASSWORD).update(ts).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch { return false; }
}

export { makeToken };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'GET') {
    try {
      const result = await list({ prefix: PATH });
      const blob = result.blobs.sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
      if (!blob) return res.status(200).json({ ok: true, places: null, source: 'default' });
      const response = await fetch(blob.url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to read stored locations');
      const places = await response.json();
      return res.status(200).json({ ok: true, places, source: 'server' });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Unable to load campus locations' });
    }
  }

  if (req.method === 'PUT') {
    if (!validToken(req.headers['x-admin-token'])) return res.status(401).json({ ok:false, error:'Unauthorized' });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ ok:false, error:'BLOB_READ_WRITE_TOKEN is not configured' });
    try {
      const places = req.body?.places;
      if (!Array.isArray(places)) return res.status(400).json({ ok:false, error:'Invalid locations data' });
      const payload = JSON.stringify(places, null, 2);
      const blob = await put(PATH, payload, { access: 'public', addRandomSuffix: false, contentType: 'application/json', allowOverwrite: true });
      return res.status(200).json({ ok:true, url:blob.url, count:places.length });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok:false, error:'Unable to save campus locations' });
    }
  }

  res.setHeader('Allow','GET, PUT');
  return res.status(405).json({ ok:false, error:'Method not allowed' });
}
