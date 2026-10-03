import crypto from 'node:crypto';

function cleanText(v,max=5000){return String(v??'').slice(0,max);}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
  try{
    const {question,place,map}=req.body||{};
    if(!question) return res.status(400).json({ok:false,error:'Question is required'});
    const apiKey=process.env.OPENAI_API_KEY;
    if(!apiKey){
      return res.status(200).json({ok:false,error:'AI is not configured',fallback:true});
    }
    const system=`You are the RYMEC Campus Navigator indoor assistant. Answer only from the supplied campus place metadata and the supplied indoor floor-map image when present. Analyze the map visually: room labels, corridors, stairs, entrances and relative positions. Do not invent a room or direction. If the map is unclear, say what is uncertain. Give concise practical directions. Always mention building and floor when known. If a map is supplied, use it as the primary spatial source.`;
    const content=[
      {type:'input_text',text:`User question: ${cleanText(question)}\nPlace metadata: ${JSON.stringify(place||{})}\nMap metadata: ${JSON.stringify(map?{building:map.building,floor:map.floor,title:map.title,note:map.note}: {})}`}
    ];
    if(map?.image && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(map.image)) content.push({type:'input_image',image_url:map.image});
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',input:[{role:'system',content:[{type:'input_text',text:system}]},{role:'user',content}],max_output_tokens:500} )});
    const data=await r.json();
    if(!r.ok) throw new Error(data?.error?.message||'AI request failed');
    const answer=data.output_text || data.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
    if(!answer) throw new Error('No AI answer returned');
    return res.status(200).json({ok:true,answer,map:map?{building:map.building,floor:map.floor,image:map.image,highlight:'Relevant indoor floor map'}:null});
  }catch(e){
    console.error('indoor-ai',e);
    return res.status(200).json({ok:false,error:'AI analysis is temporarily unavailable'});
  }
}
