import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {SYSTEM,validateMap,validateVerdict} from './logic.mjs';
const root=resolve('public'),port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
const slots=new Set(); let calls=0;
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let raw='';for await(const c of req){raw+=c;if(raw.length>3500000)throw new Error('Request too large');}return JSON.parse(raw||'{}');}
async function reason(prompt,image){
 if(!process.env.OPENAI_API_KEY)throw new Error('Configure OPENAI_API_KEY in .env, then restart.');
 if(calls>=250)throw new Error('Session request cap reached (250). Restart server deliberately to reset.');
 const content=[{type:'input_text',text:prompt}];
 if(image){if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image))throw new Error('Invalid JPEG frame');content.push({type:'input_image',image_url:image,detail:'high'});}
 calls++;
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(45000),headers:{'content-type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',max_output_tokens:4000,store:false,instructions:SYSTEM,input:[{role:'user',content}],text:{format:{type:'json_object'}}})});
 if(!r.ok)throw new Error(`OpenAI returned ${r.status}. Check API credit, model access and key permissions.`);
 const data=await r.json();
 if(data.status!=='completed')throw new Error('OpenAI response was incomplete. Retry or increase the output token limit.');
 const text=(data.output||[]).flatMap(item=>item.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
 if(!text)throw new Error('OpenAI returned no JSON output. The request may have been refused.');
 return JSON.parse(text);
}
http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 const url=new URL(req.url,'http://localhost');
 try{
  if(url.pathname.startsWith('/api/')){
   if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Cross-origin request denied'});
   if(url.pathname==='/api/status'&&req.method==='GET')return json(res,200,{openai:!!process.env.OPENAI_API_KEY,elevenlabs:!!process.env.ELEVENLABS_API_KEY,agent:!!process.env.ELEVENLABS_AGENT_ID,requests:calls});
   if(req.method!=='POST')return json(res,405,{error:'POST required'});
   const b=await body(req);
   if(slots.has(url.pathname))return json(res,429,{error:'A request is already running. Please wait.'});
   slots.add(url.pathname);
   try{
    if(url.pathname==='/api/voice'){
     if(!process.env.ELEVENLABS_API_KEY||!process.env.ELEVENLABS_AGENT_ID)throw new Error('Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in .env.');
     const r=await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(process.env.ELEVENLABS_AGENT_ID)}`,{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY},signal:AbortSignal.timeout(20000)});
     if(!r.ok)throw new Error(`ElevenLabs returned ${r.status}. Check your agent ID and key permissions.`);
     return json(res,200,await r.json());
    }
    if(url.pathname==='/api/observe')return json(res,200,await reason(`Describe the visible invoice workspace. Compare to the last observation: ${JSON.stringify(b.previous||'none')}. Return {"observation":"short precise visible change or current state","question":"one short question about WHY the expert made a visible decision or a guardrail; use would-you-rather only when meaningful","changed":true}. Do not invent hidden actions or policies. If no substantive change, changed=false. Recent conversation: ${JSON.stringify(b.transcript||[])}.`,b.image));
    if(url.pathname==='/api/debrief')return json(res,200,await reason(`Identify at least three distinct gaps NOT already answered in this expert session. Return {"questions":["...","...","..."],"summary":"tentative understanding; clearly label unknowns"}. Ask about decision boundaries, a changed condition, and escalation. DATA: ${JSON.stringify(b)}`));
    if(url.pathname==='/api/map'){
     const m=await reason(`Build a Work Map ONLY from observed events and expert statements. Return {"summary":"teach-back in under one minute","steps":[{"title":"...","decision":"...","reason":"...","guardrails":["only expert-supported rules"],"eventId":"exact event id","transcriptId":"exact USER utterance id","quote":"exact contiguous quote from that utterance"}],"unknowns":["unanswered questions"]}. Every step needs both valid references; omit unsupported steps, never invent words. DATA: ${JSON.stringify(b)}`);
     return json(res,200,validateMap(m,b.events||[],b.transcript||[]));
    }
    if(url.pathname==='/api/check'){
     if(!b.map?.confirmed)throw new Error('Expert confirmation is required before teaching.');
     const v=validateVerdict(await reason(`Assess the learner's pending save ONLY using this confirmed Work Map. Return {"verdict":"allow|block|unknown","reason":"explanation grounded in expert's words","stepIndex":0,"question":"ask learner to explain next decision"}. Use unknown if policy does not cover the case. A block must reference the supporting stepIndex. DATA: ${JSON.stringify(b)}`));
     if(v.verdict==='block' && !b.map.steps[v.stepIndex])throw new Error('Tutor could not link its intervention to evidence.');
     return json(res,200,v);
    }
    return json(res,404,{error:'Unknown API route'});
   }finally{slots.delete(url.pathname);}
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  const file=resolve(root,name);if(!file.startsWith(root+'/')){res.writeHead(403);return res.end();}
  const data=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch(e){json(res,400,{error:e.code==='ENOENT'?'File not found. Run npm run build first.':e.message});}
}).listen(port,host,()=>console.log(`AI Apprentice: http://${host}:${port} (local development; no public authentication)`));
