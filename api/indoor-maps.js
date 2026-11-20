import { put, get, del } from '@vercel/blob';
import crypto from 'node:crypto';

const INDEX_PATH = 'campus/indoor-maps/index.json';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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

function norm(v){
  return String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
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

function extForMime(mime){
  if(mime==='image/png') return 'png';
  if(mime==='image/jpeg') return 'jpg';
  return 'webp';
}

function parseImageData(data){
  const m=String(data||'').match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  if(!m)throw new Error('Only PNG, JPG or WebP images are supported.');
  const contentType=m[1].toLowerCase()==='image/jpg'?'image/jpeg':m[1].toLowerCase();
  const buffer=Buffer.from(m[2],'base64');
  if(!buffer.length)throw new Error('Uploaded image file is empty.');
  if(buffer.length>MAX_IMAGE_BYTES)throw new Error('Image exceeds the 4 MB storage limit. Please choose a smaller or lower-resolution map.');
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
      const cleanBuilding=String(building||'').trim().replace(/\s+/g,' ');
      const cleanFloor=String(floor||'').trim().replace(/\s+/g,' ');
      if(!cleanBuilding||!cleanFloor||!image)return res.status(400).json({ok:false,error:'Building, floor and image are required'});
      const {buffer,contentType}=parseImageData(image);
      const mapId=String(id||`im_${Date.now()}_${Math.random().toString(36).slice(2,6)}`).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100);
      const ext=extForMime(contentType);
      const imagePath=`campus/indoor-maps/${safe(cleanBuilding)}-${safe(cleanFloor)}-${mapId}.${ext}`;
      await put(imagePath,buffer,{access:'private',addRandomSuffix:false,contentType,allowOverwrite:true});

      const maps=await readIndex();
      const bKey=norm(cleanBuilding), fKey=norm(cleanFloor);
      const oldRecords=maps.filter(m=>m.id===mapId || (norm(m.building)===bKey && norm(m.floor)===fKey));
      const filtered=maps.filter(m=>m.id!==mapId && !(norm(m.building)===bKey && norm(m.floor)===fKey));

      for(const old of oldRecords){
        if(old.imagePath && old.imagePath!==imagePath){
          try{await del(old.imagePath);}catch(err){console.warn('Old blob cleanup warning:',old.imagePath,err);}
        }
      }

      filtered.push({
        id:mapId,
        building:cleanBuilding,
        floor:cleanFloor,
        title:String(title||cleanBuilding).trim(),
        source:String(source||'').trim(),
        note:String(note||'').trim(),
        imagePath,
        contentType,
        sizeBytes:buffer.length,
        updatedAt:new Date().toISOString()
      });
      await saveIndex(filtered);
      return res.status(200).json({ok:true,id:mapId,sizeBytes:buffer.length});
    }catch(e){console.error(e);return res.status(500).json({ok:false,error:e.message||'Unable to save indoor map'});}
  }

  if(req.method==='DELETE'){
    try{
      const id=String(req.query?.id||'').trim();
      if(!id)return res.status(400).json({ok:false,error:'Map id is required'});
      const maps=await readIndex();
      const target=maps.find(m=>m.id===id);
      if(!target)return res.status(404).json({ok:false,error:'Indoor map not found'});
      const filtered=maps.filter(m=>m.id!==id);
      await saveIndex(filtered);
      let blobDeleted=true;
      if(target.imagePath){
        try{await del(target.imagePath);}catch(e){
          blobDeleted=false;
          console.error('Indoor map blob delete failed',target.imagePath,e);
        }
      }
      return res.status(200).json({ok:true,id,blobDeleted});
    }catch(e){console.error(e);return res.status(500).json({ok:false,error:'Unable to delete indoor map'});}
  }

  res.setHeader('Allow','GET, PUT, DELETE');
  return res.status(405).json({ok:false,error:'Method not allowed'});
}
