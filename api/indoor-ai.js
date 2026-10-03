function cleanText(v,max=5000){return String(v??'').slice(0,max);}

function parseDataImage(dataUrl){
  const m=String(dataUrl||'').match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  return m ? {mimeType:m[1].toLowerCase()==='image/jpg'?'image/jpeg':m[1].toLowerCase(),data:m[2]} : null;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
  try{
    const {question,place,map}=req.body||{};
    if(!question) return res.status(400).json({ok:false,error:'Question is required'});
    const apiKey=process.env.GEMINI_API_KEY;
    if(!apiKey) return res.status(200).json({ok:false,error:'AI is not configured',fallback:true});

    const system=`You are the RYMEC Campus Navigator indoor assistant. Answer only from the supplied campus place metadata and supplied indoor floor-map image. Analyze the map visually: room labels, corridors, stairs, entrances and relative positions. Do not invent a room or direction. If the map is unclear, say what is uncertain. Give concise practical directions. Always mention building and floor when known. If a map is supplied, use it as the primary spatial source. If the user asks where a room/place is, identify its approximate position on the supplied map and explain how to reach it from a clearly visible entrance, corridor or stair when possible.\n\nReturn ONLY valid JSON with this exact structure: {"answer":"short practical answer","highlight":{"label":"place name","x":0,"y":0,"width":0,"height":0,"confidence":"high|medium|low"}}. The coordinates describe a rectangle on the supplied map image using a 0-1000 coordinate system: x/y are the rectangle's top-left corner, width/height are its size. Estimate the rectangle around the requested room/place. If the exact area cannot be identified, set highlight to null. Never invent coordinates when the map is genuinely unclear.`;
    const prompt=`${system}\n\nUser question: ${cleanText(question)}\nPlace metadata: ${JSON.stringify(place||{})}\nMap metadata: ${JSON.stringify(map?{building:map.building,floor:map.floor,title:map.title,note:map.note}: {})}`;
    const parts=[{text:prompt}];
    const img=parseDataImage(map?.image);
    if(img) parts.push({inline_data:{mime_type:img.mimeType,data:img.data}});

    const model=process.env.GEMINI_MODEL||'gemini-3.5-flash-lite';
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{temperature:0.2,maxOutputTokens:500}})});
    const data=await r.json();
    if(!r.ok) throw new Error(data?.error?.message||'Gemini request failed');
    const raw=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();
    if(!raw) throw new Error('No AI answer returned');

    let answer=raw, highlight=null;
    try{
      const start=raw.indexOf('{'), end=raw.lastIndexOf('}');
      if(start>=0 && end>start){
        const parsed=JSON.parse(raw.slice(start,end+1));
        answer=cleanText(parsed.answer||raw,2000);
        const h=parsed.highlight;
        if(h && Number.isFinite(Number(h.x)) && Number.isFinite(Number(h.y))){
          highlight={
            label:cleanText(h.label||place?.name||question,120),
            x:Math.max(0,Math.min(1000,Number(h.x))),
            y:Math.max(0,Math.min(1000,Number(h.y))),
            width:Math.max(1,Math.min(1000,Number(h.width)||60)),
            height:Math.max(1,Math.min(1000,Number(h.height)||60)),
            confidence:['high','medium','low'].includes(String(h.confidence).toLowerCase())?String(h.confidence).toLowerCase():'medium'
          };
        }
      }
    }catch(parseError){
      console.warn('Could not parse indoor highlight JSON:',parseError);
    }

    return res.status(200).json({ok:true,answer,map:map?{building:map.building,floor:map.floor,image:map.image,highlight:'Relevant indoor floor map',location:highlight}:null});
  }catch(e){
    console.error('indoor-ai',e);
    return res.status(200).json({ok:false,error:'AI analysis is temporarily unavailable'});
  }
}
