// Owner-authenticated Polaris -> Monica's House tool bridge.
// Inbound Polaris sessions are checked by worker.js; outgoing calls use a separate server-only secret.
const MONICA_BASE_URL = "https://monicas-house.rwyers.workers.dev";
const DEFAULT_MONICA_PROJECT_ID = "monicas-house";

const MONICA_VERIFY_CONTEXT = "polaris-to-monicas-house:v1:";

function b64url(bytes) {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function fromB64url(text) {
  const s = String(text).replace(/-/g,"+").replace(/_/g,"/");
  const binary = atob(s.padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
function canonicalMonicaCommand(value) {
  return {
    action: String(value?.action || ""),
    projectId: String(value?.projectId || ""),
    taskId: String(value?.taskId || ""),
    notes: String(value?.notes || "")
  };
}
async function monicaHmacKey(env) {
  if (!env.POLARIS_AUTH_SECRET) throw new Error("Polaris authentication not configured");
  return crypto.subtle.importKey("raw",new TextEncoder().encode(env.POLARIS_AUTH_SECRET),
    {name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
async function signMonicaAction(env, command) {
  const claim={
    aud:"monicas-house",
    at:Date.now(),
    nonce:crypto.randomUUID(),
    command:canonicalMonicaCommand(command)
  };
  const payload=b64url(new TextEncoder().encode(JSON.stringify(claim)));
  const sig=await crypto.subtle.sign("HMAC",await monicaHmacKey(env),
    new TextEncoder().encode(MONICA_VERIFY_CONTEXT+payload));
  return payload+"."+b64url(sig);
}

// This verification endpoint is publicly reachable, but never issues tokens.
// Only Polaris can sign an action with the existing private authentication secret.
export async function verifyMonicaBridgeRequest(request,env) {
  const j=(data,status=200)=>new Response(JSON.stringify(data),{
    status,headers:{"content-type":"application/json","cache-control":"no-store"}
  });
  if(request.method!=="POST")return j({ok:false},405);
  const raw=await request.text();
  if(raw.length>4096)return j({ok:false},413);
  let body;try{body=JSON.parse(raw)}catch{return j({ok:false},400)}
  const token=String(body?.token||"");
  if(token.length<100||token.length>2600||!token.includes("."))return j({ok:false},401);
  try{
    const [payload,signature,...extra]=token.split(".");
    if(extra.length||!payload||!signature)return j({ok:false},401);
    const verified=await crypto.subtle.verify("HMAC",await monicaHmacKey(env),
      fromB64url(signature),new TextEncoder().encode(MONICA_VERIFY_CONTEXT+payload));
    if(!verified)return j({ok:false},401);
    const claim=JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if(claim.aud!=="monicas-house"||!Number.isFinite(claim.at)
      ||Math.abs(Date.now()-claim.at)>45000
      ||typeof claim.nonce!=="string"
      ||!/^[a-f0-9-]{36}$/i.test(claim.nonce))return j({ok:false},401);
    if(!["start","pause","stop","status"].includes(claim.command?.action))
      return j({ok:false},401);
    if(JSON.stringify(claim.command)!==JSON.stringify(canonicalMonicaCommand(body)))
      return j({ok:false},401);
    return j({ok:true,nonce:claim.nonce});
  }catch{return j({ok:false},401)}
}

function humanDuration(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(n / 3600), m = Math.floor(n / 60) % 60, s = n % 60;
  return (h ? h + " hour" + (h === 1 ? "" : "s") + ", " : "") +
    (m ? m + " minute" + (m === 1 ? "" : "s") : s + " seconds");
}

function timerReply(action, state) {
  if (action === "status") {
    if (state.running)
      return "Monica's timer is running for " + state.running.label + ". Session time: " + humanDuration(state.activeSeconds) + ".";
    if (state.paused)
      return "Monica's general house timer is paused at " + humanDuration(state.activeSeconds) + ".";
    return "No Monica timer is running.";
  }
  if (state.unchanged && action === "start")
    return "Monica's timer was already running. I left it running.";
  if (state.unchanged && (action === "stop" || action === "pause"))
    return "There was no running Monica timer to " + action + ".";
  if (action === "start")
    return "Started Monica's general house timer. You can keep working and close Polaris; the timer keeps running.";
  if (action === "pause") return "Paused Monica's timer. Your time so far is saved.";
  return "Stopped Monica's timer and saved the work session to the time journal.";
}

async function requestMonica(env, action, options = {}) {
  if (!env.POLARIS_AUTH_SECRET) {
    return { error: "Polaris authentication is unavailable.", status: 503 };
  }
  const command=canonicalMonicaCommand({
    action,projectId:options.projectId||DEFAULT_MONICA_PROJECT_ID,
    taskId:options.taskId,notes:options.notes?String(options.notes).slice(0,1000):""
  });
  let token;
  try{token=await signMonicaAction(env,command)}
  catch{return {error:"Polaris could not authorize that command.",status:503}};
  let response;
  try {
    response = await fetch(MONICA_BASE_URL + "/api/polaris/timer", {
      method:"POST",
      headers:{"authorization":"Bearer "+token,"content-type":"application/json"},
      body:JSON.stringify(command),
      redirect:"error"
    });
  } catch {
    return { error: "Monica's site could not be reached.", status: 502 };
  }
  let result;
  try { result = await response.json(); }
  catch { return { error: "Monica returned an unreadable response.", status: 502 }; }
  if (!response.ok || !result.ok)
    return { error: "Monica could not complete the command: " + String(result?.error || "Unknown error").slice(0, 160), status: response.status };
  return { result };
}

export async function polarisMaybeRunMonicaTimer(message, selectedProject, env) {
  const clean = String(message || "").trim()
    .replace(/^(?:hey\s+)?polaris[\s,:-]*/i, "")
    .replace(/^(?:(?:please|can you|could you)\s+)*/i, "")
    .trim();
  const monicaContext = /\bmonica(?:'s)?\b/i.test(clean) ||
    /\bmonica(?:'s)?\b/i.test(String(selectedProject || ""));
  if (!monicaContext) return null;

  const match = clean.match(/^(start|resume|pause|stop|end|check|show)\b/i);
  const askStatus = /^(?:(?:what(?:'s| is)|how long|tell me|give me)\b)/i.test(clean)
    && /\b(?:timer|time\s+(?:spent|worked|tracking))\b/i.test(clean);
  if ((!match || !/\btimer\b/i.test(clean)) && !askStatus) return null;

  // Task-specific routing requires a verified task ID; never infer one from a room name.
  if (/\b(?:task|item|job)\b/i.test(clean) || /\btimer\b.*\b(?:for|on|in)\s+(?!monica(?:\x27s)?(?: house)?\b|general\b|house\b)(\S+)/i.test(clean))
    return { reply: "I can control individual Monica tasks once you select the exact task. For now, say 'start Monica timer' for general house work.", project: "Monica's House" };

  const verb = match?.[1].toLowerCase();
  const action = askStatus || verb === "check" || verb === "show" ? "status" :
    verb === "start" || verb === "resume" ? "start" :
    verb === "pause" ? "pause" : "stop";
  const outcome = await requestMonica(env, action);
  if (outcome.error) return { reply: outcome.error, project: "Monica's House", error: true };
  return { reply: timerReply(action, outcome.result), project: "Monica's House", timer: outcome.result, action };
}

export async function polarisMonicaTimerAPI(request, env) {
  let payload = {};
  try { payload = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "content-type": "application/json" } }); }
  if (!["start", "pause", "stop", "status"].includes(payload?.action))
    return new Response(JSON.stringify({ error: "Unsupported timer action" }), { status: 400, headers: { "content-type": "application/json" } });
  if (payload.projectId && typeof payload.projectId !== "string")
    return new Response(JSON.stringify({ error: "Invalid project ID" }), { status: 400, headers: { "content-type": "application/json" } });
  const outcome = await requestMonica(env, payload.action, {
    projectId: payload.projectId || DEFAULT_MONICA_PROJECT_ID,
    taskId: payload.taskId, notes: payload.notes
  });
  return new Response(JSON.stringify(outcome.error ? { ok: false, error: outcome.error } :
    { ok: true, ...outcome.result, reply: timerReply(payload.action, outcome.result) }), {
      status: outcome.error ? outcome.status : 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
}
