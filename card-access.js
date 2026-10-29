// North Star Ventures Access Cards (pilot). NFC NTAG215 cards are PUBLIC routing tags, not authenticators.
// No TapBin account session is ever created from possession of a clonable NFC tag alone.
const CARD_PREFIX = "nsv-access-card:v1:";
const CARD_ID_RE = /^[a-f0-9]{32}$/;
const APPS = Object.freeze({
  tapbin: { name: "TapBin", url: "https://tapbin.ca/?signin=1" }
});
function json(body, status=200) {
  return new Response(JSON.stringify(body), {status, headers: {
    "content-type":"application/json; charset=utf-8",
    "cache-control":"private, no-store",
    "x-content-type-options":"nosniff",
    "referrer-policy":"no-referrer"
  }});
}
function htmlEscape(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function(ch) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
  });
}
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
async function getCard(env, id) {
  if (!env.REGISTRY || !CARD_ID_RE.test(id)) return null;
  return await env.REGISTRY.get(CARD_PREFIX + id, "json");
}
function publicCardPage(card) {
  const links = Object.keys(APPS).filter(id => card.apps.includes(id)).map(id => {
    const app=APPS[id];
    const destination=id==="tapbin"?"https://tapbin.ca/access/"+card.id:app.url;
    return '<a class="choice" href="'+destination+'" rel="noopener noreferrer">'+htmlEscape(app.name)+' <span>Continue securely →</span></a>';
  }).join("");
  return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>North Star Access</title><style>body{background:#081728;color:#fff;font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}.card{width:min(440px,100%);background:#132a41;border:1px solid #3c5268;border-radius:24px;padding:32px;box-sizing:border-box;box-shadow:0 22px 70px #0008}.mark{font-size:12px;letter-spacing:.14em;color:#d9b980;font-weight:800}.card h1{font-size:29px;margin:22px 0 8px}.card p{line-height:1.55;color:#bfd1e0}.choice{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-top:16px;padding:18px;background:#f2f5f7;color:#15293a;text-decoration:none;border-radius:12px;font-weight:800}.choice span{font-size:12px;font-weight:600}small{display:block;margin-top:22px;color:#adc2d3;line-height:1.5}</style></head><body><main class="card"><div class="mark">✦ NORTH STAR VENTURES</div><h1>Welcome back.</h1><p>Select the application you would like to sign in to.</p>'+links+'<small>This NFC card opens your sign-in page. Your account is verified securely on your phone or by the application. A copied card alone never signs anyone in.</small></main></body></html>', {status:200, headers:{"content-type":"text/html; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
}
export async function handleCardAccessRequest(request, env, url, adminAuth) {
  const method = request.method;
  const path = url.pathname;
  const publicMatch = /^\/access\/([a-f0-9]{32})\/?$/.exec(path);
  if (publicMatch) {
    if (method !== "GET" && method !== "HEAD") return json({error:"Method not allowed"},405);
    const card = await getCard(env,publicMatch[1]);
    if (!card || card.status !== "active") return new Response("This access card is inactive or unavailable.",{status:404,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store","referrer-policy":"no-referrer"}});
    const response=publicCardPage(card);
    return method==="HEAD"?new Response(null,{status:response.status,headers:response.headers}):response;
  }
  const base = "/api/admin/access-cards";
  const match = /^\/api\/admin\/access-cards\/([a-f0-9]{32})$/.exec(path);
  if (path!==base && !match) return null;
  if (!await adminAuth(request,env)) return json({error:"Unauthorized"},401);
  if (!env.REGISTRY) return json({error:"Card registry is not configured"},503);
  if (path===base && method==="GET") {
    let cursor, cards=[];
    for(let i=0;i<8;i++) {
      const page=await env.REGISTRY.list({prefix:CARD_PREFIX,limit:100,...(cursor?{cursor}:{})});
      const results=await Promise.all(page.keys.map(key=>env.REGISTRY.get(key.name,"json")));
      cards.push(...results.filter(Boolean));
      if(page.list_complete || !page.cursor) break;
      cursor=page.cursor;
    }
    cards.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    return json({cards:cards.map(card=>({...card,program_url:url.origin+"/access/"+card.id}))});
  }
  if (!sameOrigin(request)) return json({error:"Invalid request origin"},403);
  if (path===base && method==="POST") {
    if(!(request.headers.get("content-type")||"").includes("application/json")) return json({error:"JSON required"},415);
    let body;try{body=await request.json()}catch{return json({error:"Invalid JSON"},400)}
    const label=String(body.label||"").trim().slice(0,90);
    const owner=String(body.owner||"").trim().slice(0,90);
    const email=String(body.tapbin_email||"").trim().toLowerCase().slice(0,180);
    if (!label || !owner || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({error:"Card label, customer name and valid TapBin account email required"},400);
    // Pilot: no other apps are enabled until their separate authentication integrations are tested.
    if (!Array.isArray(body.apps) || body.apps.length!==1 || body.apps[0]!=="tapbin") return json({error:"Only TapBin is supported during the pilot"},400);
    const id=crypto.randomUUID().replace(/-/g,"");
    const now=new Date().toISOString();
    const card={id,label,owner,tapbin_email:email,apps:["tapbin"],status:"active",created_at:now,updated_at:now};
    await env.REGISTRY.put(CARD_PREFIX+id,JSON.stringify(card));
    return json({ok:true,card:{...card,program_url:url.origin+"/access/"+id}},201);
  }
  if (match && method==="PATCH") {
    if(!(request.headers.get("content-type")||"").includes("application/json")) return json({error:"JSON required"},415);
    let body;try{body=await request.json()}catch{return json({error:"Invalid JSON"},400)}
    const status=String(body.status||"");
    if(!["active","suspended"].includes(status)) return json({error:"Invalid status"},400);
    const card=await getCard(env,match[1]);if(!card)return json({error:"Card not found"},404);
    card.status=status;card.updated_at=new Date().toISOString();
    await env.REGISTRY.put(CARD_PREFIX+card.id,JSON.stringify(card));
    return json({ok:true,card});
  }
  if (match && method==="DELETE") {
    const card=await getCard(env,match[1]);if(!card)return json({error:"Card not found"},404);
    // Retain tombstone for audit/revocation; no re-use.
    card.status="revoked";card.updated_at=new Date().toISOString();
    await env.REGISTRY.put(CARD_PREFIX+card.id,JSON.stringify(card));
    return json({ok:true});
  }
  return json({error:"Method not allowed"},405);
}

export const CARD_ADMIN_WIDGET = "\n<style id=\"nsv-card-access-style\">\n#nsv-card-nav{display:flex;gap:9px;flex-wrap:wrap;margin:22px 0}\n#nsv-card-nav button{border:1px solid #d4dae0;background:#fff;color:#142a40}\n#nsv-card-nav button.selected{background:#10263b;color:#fff}\n#nsv-card-view{display:none}\n#nsv-card-view .nsv-head{background:#fff;border:1px solid #dae0e4;border-radius:14px;padding:20px;margin-bottom:14px}\n#nsv-card-view .nsv-head h2{margin:0 0 4px;color:#10263b}\n#nsv-card-view .nsv-head p{font-size:13px;line-height:1.5;color:#63717d}\n#nsv-card-view .nsv-inputs{display:grid;grid-template-columns:1fr 1fr;gap:12px}\n#nsv-card-view label{display:block;font-size:12px;font-weight:800;color:#334454}\n#nsv-card-view input{margin:6px 0 8px}\n#nsv-card-view .nsv-list{margin-top:16px;display:grid;gap:10px}\n#nsv-card-view .nsv-row{background:white;border:1px solid #dae0e4;border-radius:12px;padding:14px}\n#nsv-card-view .nsv-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}\n#nsv-card-view .nsv-actions button{font-size:12px}\n#nsv-card-view .nsv-status{font-size:12px;padding:4px 8px;background:#e9f2ef;border-radius:20px}\n#nsv-card-view .nsv-note{border-left:3px solid #caa873;padding:10px 14px;background:#fff8e9;color:#614e35;font-size:12px;line-height:1.55;margin:12px 0}\n#nsv-card-view #nsv-feedback{font-size:13px;min-height:20px;margin:10px 0}\n@media(max-width:650px){#nsv-card-view .nsv-inputs{grid-template-columns:1fr}}\n</style>\n<script id=\"nsv-card-access-script\">\n(function(){\n const dash=document.getElementById('dash');\n if(!dash)return;\n const header=dash.querySelector('.top');\n const nav=document.createElement('div');nav.id='nsv-card-nav';\n nav.innerHTML='<button type=\"button\" class=\"selected\" data-view=\"messages\">Notifications</button><button type=\"button\" data-view=\"cards\">✦ Northstar Card Access</button>';\n header.insertAdjacentElement('afterend',nav);\n const children=[...dash.children].filter(el=>el!==header && el!==nav);\n const view=document.createElement('section');view.id='nsv-card-view';\n view.innerHTML='<div class=\"nsv-head\"><h2>Northstar Card Access</h2><p>Create and manage NFC access cards for your customers.</p><div class=\"nsv-note\">Pilot: TapBin only. Your NTAG215 card is a shortcut, not a security key. Existing passwords and 2FA remain in place until verified passkey sign-in is integrated.</div><form id=\"nsv-create-card\"><div class=\"nsv-inputs\"><label>Card label<input name=\"label\" placeholder=\"e.g. Client 001\" maxlength=\"90\" required></label><label>Customer name<input name=\"owner\" placeholder=\"Customer or business\" maxlength=\"90\" required></label><label style=\"grid-column:1/-1\">TapBin account email<input name=\"tapbin_email\" type=\"email\" placeholder=\"customer@example.com\" required></label></div><button type=\"submit\" class=\"pri\">Create TapBin card</button></form><div id=\"nsv-feedback\"></div></div><div class=\"nsv-head\"><div class=\"row\"><b>Customer cards</b><button id=\"nsv-refresh\" class=\"sec\" type=\"button\">Refresh</button></div><div id=\"nsv-card-list\" class=\"nsv-list\">Select this tab to load cards.</div></div>';\n dash.appendChild(view);\n const buttons=[...nav.querySelectorAll('button')];\n let cards=[];\n const esc=s=>String(s==null?'':s).replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[ch]));\n function feedback(text){document.getElementById('nsv-feedback').textContent=text;}\n async function cardApi(path, opts={}){\n   const token=localStorage.getItem('ns_admin_token');\n   const res=await fetch(path,{...opts,headers:{...(opts.headers||{}),Authorization:'Bearer '+(token||'')}});\n   const data=await res.json().catch(()=>({}));\n   if(!res.ok)throw new Error(data.error||'Request failed');\n   return data;\n }\n function show(name){\n   buttons.forEach(b=>b.classList.toggle('selected',b.dataset.view===name));\n   children.forEach(el=>el.style.display=name==='messages'?'':'none');\n   view.style.display=name==='cards'?'block':'none';\n   if(name==='cards')refresh();\n }\n buttons.forEach(b=>b.onclick=()=>show(b.dataset.view));\n function draw(){\n   const list=document.getElementById('nsv-card-list');\n   if(!cards.length){list.textContent='No cards created yet.';return;}\n   list.innerHTML=cards.map(card=>'<div class=\"nsv-row\"><div class=\"row\"><b>'+esc(card.label)+'</b><span class=\"nsv-status\">'+esc(card.status)+'</span></div><div class=\"muted\">'+esc(card.owner)+' · '+esc(card.tapbin_email)+'</div><div class=\"muted\">TapBin · '+esc(new Date(card.created_at).toLocaleDateString())+'</div><div class=\"nsv-actions\"><button type=\"button\" class=\"pri\" data-action=\"write\" data-id=\"'+esc(card.id)+'\">Write NFC</button><button type=\"button\" class=\"sec\" data-action=\"copy\" data-id=\"'+esc(card.id)+'\">Copy URL</button><button type=\"button\" class=\"sec\" data-action=\"toggle\" data-id=\"'+esc(card.id)+'\">'+(card.status==='active'?'Suspend':'Activate')+'</button><button type=\"button\" class=\"del\" data-action=\"revoke\" data-id=\"'+esc(card.id)+'\">Revoke</button></div></div>').join('');\n }\n async function refresh(){\n   try{const r=await cardApi('/api/admin/access-cards');cards=r.cards||[];draw();}\n   catch(e){document.getElementById('nsv-card-list').textContent=e.message;}\n }\n document.getElementById('nsv-refresh').onclick=refresh;\n document.getElementById('nsv-create-card').onsubmit=async function(ev){\n   ev.preventDefault();\n   const body=Object.fromEntries(new FormData(this).entries());body.apps=['tapbin'];\n   try{const r=await cardApi('/api/admin/access-cards',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});feedback('Card created. Tap Write NFC to program the blank card.');this.reset();await refresh();}\n   catch(e){feedback(e.message);}\n };\n document.getElementById('nsv-card-list').onclick=async function(ev){\n   const btn=ev.target.closest('button[data-action]');if(!btn)return;\n   const card=cards.find(c=>c.id===btn.dataset.id);if(!card)return;\n   const action=btn.dataset.action;\n   try{\n     if(action==='copy'){await navigator.clipboard.writeText(card.program_url);feedback('NFC URL copied.');return;}\n     if(action==='write'){\n       if(!('NDEFReader' in window)){feedback('This browser does not support writing NFC cards. Copy URL and use the NFC Tools app to write a URL record.');return;}\n       feedback('Hold a blank NTAG215 card against the back of your phone.');\n       const writer=new NDEFReader();\n       await writer.write({records:[{recordType:'url',data:card.program_url}]});\n       feedback('NFC card written. Test it with another tap.');return;\n     }\n     if(action==='revoke' && !confirm('Permanently revoke this card? It will no longer open the access page.'))return;\n     if(action==='toggle' || action==='revoke'){\n       const opts=action==='toggle'?{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:card.status==='active'?'suspended':'active'})}:{method:'DELETE'};\n       await cardApi('/api/admin/access-cards/'+encodeURIComponent(card.id),opts);\n       feedback(action==='revoke'?'Card revoked.':'Card status updated.');await refresh();\n     }\n   }catch(e){feedback(e.message||'Could not complete operation.');}\n };\n // Keep the existing notifications workflow and auth unchanged.\n})();\n</script>\n";
