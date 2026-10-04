import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {SYSTEM,validateMap,validateVerdict} from './logic.mjs';
const root=resolve('public'),port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
const slots=new Set(); let calls=0;
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){if(req.body!==undefined){const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(raw.length>3500000)throw new Error('Request too large');return JSON.parse(raw||'{}');}let raw='';for await(const c of req){raw+=c;if(raw.length>3500000)throw new Error('Request too large');}return JSON.parse(raw||'{}');}
async function reason(prompt,image,format={type:'json_object'}){
 if(!process.env.OPENAI_API_KEY)throw new Error('Configure OPENAI_API_KEY in .env, then restart.');
 if(calls>=250)throw new Error('Session request cap reached (250). Restart server deliberately to reset.');
 const content=[{type:'input_text',text:'Return a valid JSON object. '+prompt}];
 if(image){if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image))throw new Error('Invalid JPEG frame');content.push({type:'input_image',image_url:image,detail:'high'});}
 calls++;
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(45000),headers:{'content-type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY.trim()}`},body:JSON.stringify({model:process.env.OPENAI_MODEL?.trim()||'gpt-4.1-mini',max_output_tokens:4000,store:false,instructions:SYSTEM,input:[{role:'user',content}],text:{format}})});
 if(!r.ok){
  const failure=await r.json().catch(()=>({}));
  let detail=typeof failure?.error?.message==='string'?failure.error.message:'No error detail returned.';
  for(const name of ['OPENAI_API_KEY','ELEVENLABS_API_KEY','DEMO_ACCESS_CODE']){
   const secret=process.env[name]?.trim();if(secret)detail=detail.split(secret).join('[redacted]');
  }
  detail=detail.replace(/sk-[A-Za-z0-9_-]+/g,'[redacted key]').replace(/data:image[^\\s"']+/g,'[image omitted]').slice(0,700);
  throw new Error('OpenAI returned '+r.status+': '+detail);
 }
 const data=await r.json();
 if(data.status!=='completed')throw new Error('OpenAI response was incomplete. Retry or increase the output token limit.');
 const text=(data.output||[]).flatMap(item=>item.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
 if(!text)throw new Error('OpenAI returned no JSON output. The request may have been refused.');
 return JSON.parse(text);
}
export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 const url=new URL(req.url,'http://localhost');
 try{
  if(url.pathname.startsWith('/api/')){
   if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Cross-origin request denied'});
   if(url.pathname==='/api/status'&&req.method==='GET')return json(res,200,{openai:!!process.env.OPENAI_API_KEY,elevenlabs:!!process.env.ELEVENLABS_API_KEY,agent:!!process.env.ELEVENLABS_AGENT_ID,requests:calls,accessRequired:!!process.env.DEMO_ACCESS_CODE||!!process.env.VERCEL});
   if(req.method!=='POST')return json(res,405,{error:'POST required'});
   const access=process.env.DEMO_ACCESS_CODE;
   if(process.env.VERCEL && (!access||access.length<12))return json(res,503,{error:'Set DEMO_ACCESS_CODE to at least 12 characters in Vercel, then redeploy.'});
   if(access){const actual=Buffer.from(req.headers['x-demo-code']||''),expected=Buffer.from(access);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return json(res,401,{error:'Enter the correct demo access code using Demo access in the header.'});}

   const b=await body(req);
   if(slots.has(url.pathname))return json(res,429,{error:'A request is already running. Please wait.'});
   slots.add(url.pathname);
   try{
    if(url.pathname==='/api/voice'){
     if(!process.env.ELEVENLABS_API_KEY||!process.env.ELEVENLABS_AGENT_ID)throw new Error('Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in .env.');
     const r=await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(process.env.ELEVENLABS_AGENT_ID.trim())}`,{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY.trim()},signal:AbortSignal.timeout(20000)});
     if(!r.ok){
      const failure=await r.json().catch(()=>({}));
      const status=failure?.detail?.status;
      const hints={
       invalid_api_key:'The API key was rejected. Replace ELEVENLABS_API_KEY in Vercel with an active key, then redeploy.',
       missing_permissions:'The API key is missing a required permission. Check the ElevenAgents permission on the exact key saved in Vercel.',
       agent_not_found:'The agent was not found or is not accessible. Check that the agent ID and API key belong to the same ElevenLabs workspace.',
       quota_exceeded:'The ElevenLabs credit quota has been reached.',
       key_disabled:'The API key is disabled. Replace it in Vercel with an active key, then redeploy.'
      };
      const hint=Object.hasOwn(hints,status)?hints[status]:'Check the active API key, its ElevenAgents permission, and whether the agent belongs to the same workspace.';
      // Only display known status codes and our own messages, never raw provider text or credentials.
      const code=Object.hasOwn(hints,status)?' ('+status+')':'';
      throw new Error('ElevenLabs returned '+r.status+code+'. '+hint);
     }
     return json(res,200,await r.json());
    }
    if(url.pathname==='/api/observe')return json(res,200,await reason(`Describe the visible invoice workspace. Compare to the last observation: ${JSON.stringify(b.previous||'none')}. Return {"observation":"short precise visible change or current state","question":"one short question about WHY the expert made a visible decision or a guardrail; use would-you-rather only when meaningful","changed":true}. Do not invent hidden actions or policies. If no substantive change, changed=false. Recent conversation: ${JSON.stringify(b.transcript||[])}.`,b.image));
    if(url.pathname==='/api/debrief')return json(res,200,await reason(`Identify at least three distinct gaps NOT already answered in this expert session. Return {"questions":["...","...","..."],"summary":"tentative understanding; clearly label unknowns"}. Ask about decision boundaries, a changed condition, and escalation. DATA: ${JSON.stringify(b)}`));
    if(url.pathname==='/api/map'){
     const moments=b.events||[],utterances=(b.transcript||[]).filter(t=>t.role==='user'&&typeof t.text==='string'&&t.text.trim());
     if(!moments.length||!utterances.length)throw new Error('Capture a screen moment and expert explanation before building the map.');
     const eventRefs=moments.map((_,i)=>'E'+(i+1)),quoteRefs=utterances.map((_,i)=>'T'+(i+1));
     const string={type:'string'},strings={type:'array',items:string};
     const format={type:'json_schema',name:'evidence_work_map',strict:true,schema:{type:'object',additionalProperties:false,properties:{
      summary:string,unknowns:strings,steps:{type:'array',items:{type:'object',additionalProperties:false,properties:{
       title:string,decision:string,reason:string,guardrails:strings,eventRef:{type:'string',enum:eventRefs},transcriptRef:{type:'string',enum:quoteRefs}
      },required:['title','decision','reason','guardrails','eventRef','transcriptRef']}}
     },required:['summary','unknowns','steps']}};
     const evidence={events:moments.map((e,i)=>({ref:eventRefs[i],time:e.time,observation:e.observation})),expertStatements:utterances.map((t,i)=>({ref:quoteRefs[i],time:t.time,text:t.text}))};
     const m=await reason(`Build a Work Map ONLY from this evidence. Select a listed eventRef and transcriptRef for each step. The server will copy the actual expert quote; do not compose quotes. Every claim in a step must be supported by its selected expert statement. Split steps if different statements support different rules. Populate guardrails with actual expert-stated stop conditions, never placeholder instructions. Label hypothetical exceptions as "Expert-described exception" in decision; never claim they were performed. For these exceptions, the screenshot is discussion context, not proof the exception occurred. Keep classification separate from payment approval, and duplicate/controller review separate from bank-change/finance review. Unknown or conflicting policies belong in unknowns. Return a concise teach-back summary and supported steps. DATA: ${JSON.stringify(evidence)}`,undefined,format);
     if(!Array.isArray(m.steps))throw new Error('Map did not include steps.');
     m.steps=m.steps.map(s=>{
      const event=moments[eventRefs.indexOf(s.eventRef)],utterance=utterances[quoteRefs.indexOf(s.transcriptRef)];
      if(!event||!utterance)throw new Error('Map selected an unavailable evidence reference.');
      const {eventRef,transcriptRef,...step}=s;
      return {...step,eventId:event.id,transcriptId:utterance.id,quote:utterance.text};
     });
     return json(res,200,validateMap(m,moments,utterances));
    }
    if(url.pathname==='/api/check'){
     if(!b.map?.confirmed)throw new Error('Expert confirmation is required before teaching.');
     const v=validateVerdict(await reason(`Assess the learner's pending save ONLY using this confirmed Work Map. Return {"verdict":"allow|block|unknown","reason":"explanation grounded in expert's words","stepIndex":0,"question":"ask learner to explain next decision"}. Use unknown if policy does not cover the case. A block must reference the supporting stepIndex, using the explicit zero-based stepIndex labels in DATA. In reason and question, refer to the rule by its title or content: NEVER write step numbers, Step 0, or stepIndex. The UI adds the human-readable citation. Assess classification and payment disposition separately. Check ALL applicable confirmed guardrails before allowing a save; a classification rule never implies unconditional payment approval. Explain hold exceptions when relevant. DATA: ${JSON.stringify({...b,map:{...b.map,steps:b.map.steps.map((s,stepIndex)=>({...s,stepIndex}))}})}`));
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
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){http.createServer(handler).listen(port,host,()=>console.log(`AI Apprentice: http://${host}:${port}`));}
