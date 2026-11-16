const APP_HTML = __APP_HTML__;

const cookieName = "sr_session";
const sessionTtl = 60 * 60 * 24 * 7;

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

function constantTimeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let mismatch = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) mismatch |= (x[i] || 0) ^ (y[i] || 0);
  return mismatch === 0;
}

async function hmac(payload, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function getKidsSession(request,env){
  const raw=request.headers.get("cookie")||"";
  const value=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("sr_kids="))?.slice(8);
  if(!value)return null;
  const [expires,encoded,signature]=value.split(".");
  if(!expires||!encoded||!signature||Number(expires)<Math.floor(Date.now()/1000))return null;
  if(!constantTimeEqual(signature,await hmac(expires+"."+encoded,env.SESSION_SECRET)))return null;
  try{return atob(encoded.replaceAll("-","+").replaceAll("_","/"))}catch{return null}
}
async function validSession(request, env) {
  const raw = request.headers.get("cookie") || "";
  const token = raw.split(";").map(x => x.trim()).find(x => x.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  if (!token || !env.SESSION_SECRET) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return constantTimeEqual(signature, await hmac(expires, env.SESSION_SECRET));
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || new URL(origin).origin === new URL(request.url).origin;
}

async function openAi(request, path, body) {
  const headers = { authorization: `Bearer ${body.apiKey}` };
  if (body.json) headers["content-type"] = "application/json";
  return fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers,
    body: body.form || JSON.stringify(body.json),
  });
}

async function api(request, env, url) {
  if (!sameOrigin(request)) return json({ error: "Cross-site request blocked." }, 403);
  if (url.pathname === "/api/login" && request.method === "POST") {
    if (!env.APP_PASSWORD || !env.SESSION_SECRET) return json({ error: "Private access is not configured." }, 503);
    const payload = await request.json().catch(() => ({}));
    const supplied = String(payload.password || "");
    if (!constantTimeEqual(supplied, env.APP_PASSWORD)) return json({ error: "Password not accepted." }, 401);
    const exp = String(Math.floor(Date.now() / 1000) + sessionTtl);
    const signature = await hmac(exp, env.SESSION_SECRET);
    return json({ ok: true }, 200, { "set-cookie": `${cookieName}=${exp}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${sessionTtl}` });
  }
  if (url.pathname === "/api/session" && request.method === "GET") return validSession(request, env) ? json({ ok: true }) : json({ error: "Sign in required." }, 401);
  if (!await validSession(request, env)) return json({ error: "Sign in required." }, 401);
  if (url.pathname === "/api/status" && request.method === "GET") return json({ aiConfigured: Boolean(env.OPENAI_API_KEY) });
  if(url.pathname==="/api/kids-library/connect"&&request.method==="POST"){
    const body=await request.json().catch(()=>({})),code=String(body.code||"").trim();
    if(code.length<4||code.length>150)return json({error:"Enter a valid Kids Church access code."},400);
    let login;
    try{login=await fetch("https://kids.greatchurch.ca/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code,remember:true})})}
    catch{return json({error:"Could not reach the Kids Church site."},502)}
    if(!login.ok)return json({error:"Kids Church access code was not accepted."},401);
    const setCookie=login.headers.get("set-cookie")||"",match=setCookie.match(/__Host-gck_session=([^;]+)/);
    if(!match)return json({error:"Kids Church did not create a video library session."},502);
    const expires=String(Math.floor(Date.now()/1000)+31536000),encoded=btoa(match[1]).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
    const signature=await hmac(expires+"."+encoded,env.SESSION_SECRET);
    return json({ok:true},200,{"set-cookie":"sr_kids="+expires+"."+encoded+"."+signature+"; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000"});
  }
  if(url.pathname==="/api/kids-library/list"&&request.method==="GET"){
    const kidsCookie=await getKidsSession(request,env);
    if(!kidsCookie)return json({connected:false,items:[]});
    const target=new URL("https://kids.greatchurch.ca/api/library/list");
    target.searchParams.set("path",url.searchParams.get("path")||"");
    let upstream;
    try{upstream=await fetch(target.toString(),{headers:{cookie:"__Host-gck_session="+kidsCookie},cache:"no-store"})}
    catch{return json({error:"Could not reach the Kids Church video library."},502)}
    if(upstream.status===401)return json({connected:false,items:[]});
    const data=await upstream.json().catch(()=>null);
    if(!upstream.ok||!data)return json({error:data?.error||"Kids Church could not list the shared videos."},502);
    return json(data,200,{"cache-control":"no-store"});
  }
  if(url.pathname==="/api/kids-library/media"&&request.method==="GET"){
    const kidsCookie=await getKidsSession(request,env);
    if(!kidsCookie)return json({error:"Connect the Kids Church library first."},401);
    const target=new URL("https://kids.greatchurch.ca/api/library/media");
    target.searchParams.set("path",url.searchParams.get("path")||"");
    const headers=new Headers({cookie:"__Host-gck_session="+kidsCookie});
    const range=request.headers.get("range");if(range)headers.set("range",range);
    let upstream;
    try{upstream=await fetch(target.toString(),{headers,cache:"no-store"})}
    catch{return json({error:"Could not stream this Kids Church video."},502)}
    if(!upstream.ok&&upstream.status!==206)return json({error:"Kids Church could not stream this video."},502);
    const out=new Headers({"cache-control":"private, no-store","x-content-type-options":"nosniff","accept-ranges":"bytes"});
    for(const key of ["content-type","content-length","content-range","etag"]){const v=upstream.headers.get(key);if(v)out.set(key,v)}
    out.set("content-disposition","inline");
    return new Response(upstream.body,{status:upstream.status,headers:out});
  }
  if (!env.OPENAI_API_KEY) return json({ error: "OpenAI API key is not configured." }, 503);

  if (url.pathname === "/api/transcribe" && request.method === "POST") {
    const incoming = await request.formData();
    const file = incoming.get("audio");
    const offset = Number(incoming.get("offset") || 0);
    if (!(file instanceof File) || file.size < 1500 || file.size > 24 * 1024 * 1024) return json({ error: "Audio chunk must be between 1.5 KB and 24 MB." }, 400);
    const form = new FormData();
    form.append("file", new File([file], file.name || "clip.webm", { type: file.type || "audio/webm" }));
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    form.append("timestamp_granularities[]", "word");
    const response = await openAi(request, "audio/transcriptions", { apiKey: env.OPENAI_API_KEY, form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: result.error?.message || "Transcription request failed." }, 502);
    return json({ segments: (result.segments || []).map(s => ({ start: Number(s.start || 0), end: Number(s.end || 0), text: String(s.text || "") })), words: (result.words || []).map(w => ({ word: String(w.word || ""), start: Number(w.start || 0), end: Number(w.end || 0) })), offset });
  }

  if (url.pathname === "/api/moderate-text" && request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    const segments = Array.isArray(payload.segments) ? payload.segments.slice(0, 40) : [];
    if (!segments.length) return json({ segments: [] });
    if (segments.some(s => typeof s.text !== "string" || s.text.length > 1500)) return json({ error: "Transcript text is invalid or too long." }, 400);
    const response = await openAi(request, "moderations", { apiKey: env.OPENAI_API_KEY, json: {
      model: "omni-moderation-latest",
      input: segments.map(s => ({ type: "text", text: s.text })),
    } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: result.error?.message || "Transcript review request failed." }, 502);
    const categoryGroups = {
      sexual: ["sexual"],
      violence: ["violence", "violence/graphic"],
      hate: ["hate", "hate/threatening", "harassment", "harassment/threatening"],
      "self-harm": ["self-harm", "self-harm/intent", "self-harm/instructions"],
      illicit: ["illicit", "illicit/violent"],
    };
    const analyzed = segments.map((segment, i) => {
      const categories = result.results?.[i]?.categories || {};
      return { ...segment, categories: Object.entries(categoryGroups).filter(([, keys]) => keys.some(k => categories[k])).map(([key]) => key) };
    });
    return json({ segments: analyzed });
  }

  if (url.pathname === "/api/moderate-images" && request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    const frames = Array.isArray(payload.frames) ? payload.frames.slice(0, 5) : [];
    if (!frames.length) return json({ flags: [] });
    for (const frame of frames) {
      if (typeof frame.image !== "string" || !/^data:image\/(jpeg|webp);base64,/.test(frame.image) || frame.image.length > 1_400_000) return json({ error: "A frame image is invalid or too large." }, 400);
    }
    const response = await openAi(request, "moderations", { apiKey: env.OPENAI_API_KEY, json: {
      model: "omni-moderation-latest",
      input: frames.map(frame => ({ type: "image_url", image_url: { url: frame.image } })),
    } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: result.error?.message || "Image review request failed." }, 502);
    const flags = (result.results || []).flatMap((r, i) => {
      const score = Number(r.category_scores?.sexual || 0);
      return (r.categories?.sexual || score >= 0.35) ? [{ time: Number(frames[i]?.time || 0), label: "Possible sexual or nudity content", score: Math.round(score * 100) / 100 }] : [];
    });
    return json({ flags });
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request, env, url);
    if (url.pathname === "/health") return json({ app: "SafeReel", status: "ready" });
    return new Response(APP_HTML, { headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      "content-security-policy": "default-src 'self'; img-src 'self' data: blob:; media-src blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
    } });
  }
};
