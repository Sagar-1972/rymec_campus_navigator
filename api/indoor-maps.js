import { put, get, del } from '@vercel/blob';
import crypto from 'node:crypto';

const INDEX_PATH = 'campus/indoor-maps/index.json';

function validToken(token){
  try{
    const [ts,sig]=String(token||'').split('.');
    if(!ts||!sig)return false;
    const age=Date.now()-Number(ts);
    if(!Number.isFinite(age)||age<0||age>12*60*60*1000)return false;
    const secret=process.env.ADMIN_PASSWORD || 'admin123';
    const expected=crypto.createHmac('sha256',secret).update(ts).digest('hex');
    const a=Buffer.from(sig),b=Buffer.from(expected);
    return a.length===b.length&&crypto.timingSafeEqual(a,b);
  }catch{return false;}
}

async function readIndex(){
  try{
    const result=await get(INDEX_PATH,{access:'private',useCache:false});
    if(!result)return [];
    const text=await new Response(result.stream).text();
    const data=JSON.parse(text);
    return Array.isArray(data)?data:[];
  }catch(e){
    if(String(e?.message||'').toLowerCase().includes('not found'))return [];
    throw e;
  }
}

function safe(s){return String(s||'').trim().replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'map';}

function parseImageData(data){
  const m=String(data||'').match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  if(!m)throw new Error('Only PNG, JPG or WebP images are supported.');
  const contentType=m[1].toLowerCase()==='image/jpg'?'image/jpeg':m[1].toLowerCase();
  const buffer=Buffer.from(m[2],'base64');
  if(!buffer.length||buffer.length>4*1024*1024)throw new Error('Image is too large. Please upload a smaller map.');
  return {buffer,contentType};
}

async function saveIndex(maps){
  await put(INDEX_PATH,JSON.stringify(maps,null,2),{access:'private',addRandomSuffix:false,contentType:'application/json',allowOverwrite:true});
}

async function hydrate(maps){
  const out=[];
  for(const m of maps){
    try{
      const result=await get(m.imagePath,{access:'private',useCache:false});
      if(!result)continue;
      const buf=Buffer.from(await new Response(result.stream).arrayBuffer());
      const type=m.contentType||'image/webp';
      out.push({...m,image:`data:${type};base64,${buf.toString('base64')}`});
    }catch(e){
      console.error('Indoor map read failed',m.imagePath,e);
    }
  }
  return out;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0, must-revalidate');
  if(req.method==='GET'){
    try{
      const maps=await readIndex();
      return res.status(200).json({ok:true,maps:await hydrate(maps)});
    }catch(e){console.error(e);return res.status(500).json({ok:false,error:'Unable to load indoor maps'});}
  }

  if(!validToken(req.headers['x-admin-token']))return res.status(401).json({ok:false,error:'Unauthorized'});

  if(req.method==='PUT'){
    try{
      const {id,building,floor,title,source,note,image}=req.body||{};
      if(!building||!floor||!image)return res.status(400).json({ok:false,error:'Building, floor and image are required'});
      const {buffer,contentType}=parseImageData(image);
      const mapId=String(id||`im_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100);
      const imagePath=`campus/indoor-maps/${safe(building)}-${safe(floor)}-${mapId}.webp`;
      await put(imagePath,buffer,{access:'private',addRandomSuffix:false,contentType,allowOverwrite:true});
      const maps=await readIndex();
      const oldRecords=maps.filter(m=>m.id===mapId || (m.building===building&&m.floor===floor));
      const filtered=maps.filter(m=>m.id!==mapId && !(m.building===building&&m.floor===floor));
      for(const old of oldRecords){if(old.imagePath!==imagePath){try{await del(old.imagePath);}catch{}}}
      filtered.push({id:mapId,building:String(building),floor:String(floor),title:String(title||building),source:String(source||''),note:String(note||''),imagePath,contentType,updatedAt:new Date().toISOString()});
      await saveIndex(filtered);
      return res.status(200).json({ok:true,id:mapId});
    }catch(e){console.error(e);return res.status(500).json({ok:false,error:e.message||'Unable to save indoor map'});}
  }

  if(req.method==='DELETE'){
    try{
      const id=String(req.query?.id||'');
      if(!id)return res.status(400).json({ok:false,error:'Map id is required'});
      const maps=await readIndex();
      const target=maps.find(m=>m.id===id);
      if(!target)return res.status(404).json({ok:false,error:'Indoor map not found'});
      const filtered=maps.filter(m=>m.id!==id);
      await saveIndex(filtered);
      try{await del(target.imagePath);}catch(e){console.error('Indoor map blob delete failed',e);}
      return res.status(200).json({ok:true});
    }catch(e){console.error(e);return res.status(500).json({ok:false,error:'Unable to delete indoor map'});}
  }

  res.setHeader('Allow','GET, PUT, DELETE');
  return res.status(405).json({ok:false,error:'Method not allowed'});
}
