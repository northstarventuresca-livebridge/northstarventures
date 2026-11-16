// Owner-authenticated Polaris -> Monica's House tool bridge.
// Inbound Polaris sessions are checked by worker.js; outgoing calls use a separate server-only secret.
const MONICA_BASE_URL = "https://monicas-house.rwyers.workers.dev";
const DEFAULT_MONICA_PROJECT_ID = "monicas-house";

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
  if (!env.POLARIS_BRIDGE_SECRET || String(env.POLARIS_BRIDGE_SECRET).length < 32) {
    return { error: "The secure connection to Monica has not been configured yet.", status: 503 };
  }
  const projectId = options.projectId || DEFAULT_MONICA_PROJECT_ID;
  const isStatus = action === "status";
  const path = "/api/polaris/timer";
  const url = MONICA_BASE_URL + path + (isStatus ? "?projectId=" + encodeURIComponent(projectId) : "");
  let response;
  try {
    response = await fetch(url, {
      method: isStatus ? "GET" : "POST",
      headers: {
        "authorization": "Bearer " + env.POLARIS_BRIDGE_SECRET,
        ...(isStatus ? {} : { "content-type": "application/json" })
      },
      ...(isStatus ? {} : { body: JSON.stringify({
        action, projectId, ...(options.taskId ? { taskId: options.taskId } : {}),
        ...(options.notes ? { notes: String(options.notes).slice(0, 1000) } : {})
      }) }),
      redirect: "error"
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
  if (/\b(?:for|on)\s+(?:the\s+)?(?:task|item|job)\b/i.test(clean))
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
