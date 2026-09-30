import { put, get } from '@vercel/blob';
import crypto from 'node:crypto';

const PATH = 'campus/routes.json';
function validToken(token){
  try{const [ts,sig]=String(token||'').split('.');if(!ts||!sig||!process.env.ADMIN_PASSWORD)return false;const age=Date.now()-Number(ts);if(!Number.isFinite(age)||age<0||age>12*60*60*1000)return false;const expected=crypto.createHmac('sha256',process.env.ADMIN_PASSWORD).update(ts).digest('hex');const a=Buffer.from(sig),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b);}catch{return false;}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0, must-revalidate');
  if(req.method==='GET'){
    try{const result=await get(PATH,{access:'private',useCache:false});if(!result)return res.status(200).json({ok:true,routes:[],source:'default'});const text=await new Response(result.stream).text();const routes=JSON.parse(text);if(!Array.isArray(routes))throw new Error('Stored routes are invalid');return res.status(200).json({ok:true,routes,source:'server'});}
    catch(e){if(String(e?.message||'').toLowerCase().includes('not found'))return res.status(200).json({ok:true,routes:[],source:'default'});console.error(e);return res.status(500).json({ok:false,error:'Unable to load campus routes'});}
  }
  if(req.method==='PUT'){
    if(!validToken(req.headers['x-admin-token']))return res.status(401).json({ok:false,error:'Unauthorized'});
    try{const routes=req.body?.routes;if(!Array.isArray(routes))return res.status(400).json({ok:false,error:'Invalid routes data'});for(const r of routes){if(!r||!Array.isArray(r.points)||r.points.length<2) return res.status(400).json({ok:false,error:'Each route needs at least two points'});}const blob=await put(PATH,JSON.stringify(routes,null,2),{access:'private',addRandomSuffix:false,contentType:'application/json',allowOverwrite:true});return res.status(200).json({ok:true,count:routes.length,pathname:blob.pathname});}
    catch(e){console.error(e);return res.status(500).json({ok:false,error:'Unable to save campus routes'});}
  }
  res.setHeader('Allow','GET, PUT');return res.status(405).json({ok:false,error:'Method not allowed'});
}
