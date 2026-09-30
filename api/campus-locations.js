import { put, get } from '@vercel/blob';
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
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

export { makeToken };

export default async function handler(req, res) {
  // Location data should never be cached between devices. Private Blob reads
  // also use useCache:false so an overwrite is visible immediately.
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');

  if (req.method === 'GET') {
    try {
      const result = await get(PATH, { access: 'private', useCache: false });
      if (!result) {
        return res.status(200).json({ ok: true, places: null, source: 'default' });
      }

      const text = await new Response(result.stream).text();
      const places = JSON.parse(text);
      if (!Array.isArray(places)) throw new Error('Stored locations are invalid');

      return res.status(200).json({ ok: true, places, source: 'server' });
    } catch (e) {
      // A missing object is expected before the first admin save. Keep that
      // case distinct from real storage errors.
      if (String(e?.message || '').toLowerCase().includes('not found')) {
        return res.status(200).json({ ok: true, places: null, source: 'default' });
      }
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Unable to load campus locations' });
    }
  }

  if (req.method === 'PUT') {
    if (!validToken(req.headers['x-admin-token'])) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    try {
      const places = req.body?.places;
      if (!Array.isArray(places)) {
        return res.status(400).json({ ok: false, error: 'Invalid locations data' });
      }

      const payload = JSON.stringify(places, null, 2);
      const blob = await put(PATH, payload, {
        access: 'private',
        addRandomSuffix: false,
        contentType: 'application/json',
        allowOverwrite: true
      });

      return res.status(200).json({ ok: true, count: places.length, pathname: blob.pathname });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Unable to save campus locations' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
