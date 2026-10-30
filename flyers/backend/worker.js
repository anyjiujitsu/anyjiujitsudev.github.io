// Cloudflare Worker. Deploy separately; do not expose OPENAI_API_KEY on GitHub Pages.
const STYLE_PROMPTS = {
 heritage:'Vintage New England grappling flyer, warm cream and forest green, subtle letterpress grain, restrained geometric framing, historical printmaking texture',
 fight:'Underground combat-sports editorial design, charcoal black, restrained burnt orange, dramatic harsh lighting, bold asymmetric energy, distressed screen-print textures',
 editorial:'Minimal contemporary Swiss-inspired editorial poster, balanced white space, ivory, deep pine green, refined graphic blocks, clean layout',
 retro:'1990s underground tournament ephemera, faded rust and sand, halftone texture, analog photocopy overlays, strong poster geometry',
 electric:'Experimental combat sport poster, deep midnight navy, intense lime highlights, sharp graphic energy and high contrast dynamic abstract shapes'
};
export default {async fetch(request,env){
 const origin=request.headers.get('Origin')||'';
 const allowed=env.ALLOWED_ORIGIN||'https://anyjiujitsu.github.io';
 const headers={'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Flyers-Access','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin!==allowed)return reply({error:'Origin not authorized'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 const path=new URL(request.url).pathname;
 if(path!=='/generate'||request.method!=='POST')return reply({error:'Not found'},404);
 if(!env.OPENAI_API_KEY||!env.FLYERS_ACCESS_CODE)return reply({error:'Worker secrets not configured'},503);
 if(request.headers.get('X-Flyers-Access')!==env.FLYERS_ACCESS_CODE)return reply({error:'Invalid private DEV access code'},401);
 const size=Number(request.headers.get('content-length')||'0');if(size>2000)return reply({error:'Request too large'},413);
 let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400)}
 if(!body||!Object.prototype.hasOwnProperty.call(STYLE_PROMPTS,body.style))return reply({error:'Unknown style'},400);
 const n=Number.isInteger(body.variation)?Math.min(4,Math.max(0,body.variation)):0;
 const prompt=`Create ORIGINAL high quality 4:5 portrait background artwork for a jiu-jitsu event flyer. Style: ${STYLE_PROMPTS[body.style]}. Variation ${n+1}: alter graphic movement and texture. Artwork/background ONLY. NO text, letters, numbers, logos, watermarks, portraits, athletes, human figures, or readable marks. The central area should harmonize with a real photo subject overlaid later. Reserve relatively calm regions at the top 23% and bottom 30% because exact informational typography will be composited by the website. Rich professional print texture, careful spacing, compelling distinct design, full bleed.`;
 let result;
 try{result=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{'Authorization':'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-image-1.5',prompt,size:'1024x1536',quality:'low',output_format:'jpeg',n:1})});}
 catch{return reply({error:'AI provider unavailable'},502)}
 let json;try{json=await result.json()}catch{return reply({error:'Invalid provider response'},502)}
 if(!result.ok)return reply({error:'Image provider error ('+result.status+'): '+String(json.error?.message||'Unknown').slice(0,140)},502);
 const encoded=json.data?.[0]?.b64_json;if(!encoded)return reply({error:'No generated image returned'},502);
 return reply({image:'data:image/jpeg;base64,'+encoded});
}};
