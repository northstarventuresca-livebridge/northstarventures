// Staged HOH Worker integration, NOT imported/deployed in the live Worker.
// Add as a module to the existing HOH Cloudflare Worker during the reviewed rollout.
// HOH retains ownership of its identity, sessions and sensitive D1 database.
// The RPC class is accessible ONLY to a Worker with an explicit Cloudflare service binding.
import { WorkerEntrypoint } from "cloudflare:workers";

const ONE_MINUTE = 60;
const ONE_WEEK = 7 * 24 * 60 * 60;
const OWNER = "northstarventures";
const TICKET_TABLE = `CREATE TABLE IF NOT EXISTS nsv_sso_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const encode = new TextEncoder();
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, x => x.toString(16).padStart(2, "0")).join("");
}
async function hash(token) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encode.encode(token))),
    x => x.toString(16).padStart(2, "0")).join("");
}
function json(data, status=200, extra={}) {
  return new Response(JSON.stringify(data), {
    status, headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      ...extra
    }
  });
}
async function owner(env) {
  if (!env.DB) return null;
  return env.DB.prepare(
    `SELECT id FROM auth_users
       WHERE username=? AND role_id='super_admin' AND is_developer=1
       AND is_active=1 AND must_change_password=0 LIMIT 1`
  ).bind(OWNER).first();
}

/** Private service binding, NEVER expose through an HTTP endpoint. */
export class NorthStarHOHLogin extends WorkerEntrypoint {
  async issueOwnerTicket() {
    const user = await owner(this.env);
    if (!user) throw new Error("HOH developer profile unavailable");
    await this.env.DB.exec(TICKET_TABLE);
    const token = randomToken();
    await this.env.DB.prepare(
      "INSERT INTO nsv_sso_tickets(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+60 seconds'))"
    ).bind(await hash(token), user.id).run();
    return { ticket: token, expires_in_seconds: ONE_MINUTE };
  }
  // Available for later central cross-app "Log out everywhere" implementation.
  async revokeOwnerSessions() {
    const user = await owner(this.env);
    if (!user) throw new Error("HOH developer profile unavailable");
    await this.env.DB.batch([
      this.env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(user.id),
      this.env.DB.prepare(
        "UPDATE nsv_session_log SET ended_at=CURRENT_TIMESTAMP,last_seen_at=CURRENT_TIMESTAMP WHERE user_id=? AND ended_at IS NULL"
      ).bind(user.id)
    ]);
    return { revoked: true };
  }
}

/**
 * Call this function in the HOH Worker's fetch handler BEFORE its existing login
 * dispatcher, with the actual request and its already-bound DB environment.
 * It deliberately does NOT accept arbitrary user IDs or redirects.
 */
export async function handleNorthStarHOHSSO(request, env, url) {
  const path = url.pathname;
  if (path === "/sso" && request.method === "GET") {
    // The ticket is delivered in a URL fragment. Browsers never send it to
    // Cloudflare in the GET; JavaScript posts it back to the same HOH origin.
    const nonce = randomToken();
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>North Star · Home of Hope</title></head><body>
<main><h1>Opening Home of Hope…</h1><p id="status">Signing you in securely.</p></main>
<script nonce="${nonce}">(async function(){
  const params=new URLSearchParams(location.hash.slice(1));
  const ticket=params.get('ticket');
  history.replaceState(null,'',location.pathname);
  const status=document.getElementById('status');
  if(!ticket){status.textContent='Missing or expired sign-in ticket. Return to North Star Command Center.';return}
  try{
    const response=await fetch('/api/nsv-sso/redeem',{
      method:'POST',credentials:'same-origin',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({ticket})
    });
    if(!response.ok)throw Error('Sign-in ticket could not be verified.');
    location.replace('/');
  }catch(e){status.textContent=e.message+' Open the Home of Hope tile again to retry.'}
})()</script></body></html>`;
    return new Response(html,{
      headers:{
        "content-type":"text/html; charset=utf-8",
        "cache-control":"no-store",
        "referrer-policy":"no-referrer",
        "x-frame-options":"DENY",
        "content-security-policy":`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`
      }
    });
  }
  if (path !== "/api/nsv-sso/redeem") return null;
  if(request.method !== "POST") return json({error:"Method not allowed"},405);
  if(request.headers.get("origin") !== url.origin) return json({error:"Invalid origin"},403);
  if(!(request.headers.get("content-type")||"").startsWith("application/json")) return json({error:"JSON required"},415);
  if(Number(request.headers.get("content-length")||0)>2048) return json({error:"Request too large"},413);
  let input;
  try { input=await request.json(); } catch { return json({error:"Invalid JSON"},400) }
  const ticket = String(input?.ticket||"");
  if(!/^[0-9a-f]{64}$/.test(ticket)) return json({error:"Invalid or expired ticket"},403);
  if(!env.DB) return json({error:"HOH authentication unavailable"},503);
  await env.DB.exec(TICKET_TABLE);
  // RETURNING + used_at IS NULL atomically prevents the same ticket being
  // redeemed twice, including simultaneous requests.
  const redeemed=await env.DB.prepare(
    `UPDATE nsv_sso_tickets SET used_at=CURRENT_TIMESTAMP
     WHERE token_hash=? AND used_at IS NULL AND expires_at>datetime('now')
     RETURNING user_id`
  ).bind(await hash(ticket)).first();
  const user=await owner(env);
  if(!redeemed||!user||redeemed.user_id!==user.id) return json({error:"Invalid or expired ticket"},403);

  const session=randomToken()+randomToken();
  const idHash=await hash(session);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO auth_sessions(id_hash,user_id,expires_at) VALUES (?,?,datetime('now','+7 days'))"
    ).bind(idHash,user.id),
    env.DB.prepare("INSERT INTO nsv_session_log(id_hash,user_id) VALUES (?,?)").bind(idHash,user.id),
    env.DB.prepare(
      "INSERT INTO auth_events(id,actor_id,action,target_id) VALUES (?,?,?,?)"
    ).bind(crypto.randomUUID(),user.id,"nsv.sso.login",user.id)
  ]);
  return json({success:true},200,{
    "set-cookie":`hoh_session=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ONE_WEEK}`
  });
}
