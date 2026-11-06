
// Additional Songwriter's Compass features: progression, administration and private messaging.
// All database access is permission-scoped; no private song body is returned to admins.
async function eventLog(db,userId,kind){
 await db.prepare("INSERT INTO usage_events(id,user_id,kind,created_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(),userId,kind,now()).run();
}
async function progressFor(db,userId,withAwards=true){
 const results=await Promise.all([
  db.prepare("SELECT id,title,status,mission,scriptures,lyrics FROM songs WHERE user_id=? LIMIT 400").bind(userId).all(),
  db.prepare("SELECT count(*) AS n FROM journal_entries WHERE user_id=?").bind(userId).first(),
  db.prepare("SELECT count(*) AS n FROM ai_call_logs WHERE user_id=?").bind(userId).first(),
  db.prepare("SELECT count(*) AS n FROM dm_messages WHERE sender_id=?").bind(userId).first(),
  db.prepare("SELECT count(*) AS n FROM dm_messages WHERE sender_id=? AND shared_title IS NOT NULL").bind(userId).first(),
  db.prepare("SELECT count(DISTINCT date(created_at,'unixepoch')) AS n FROM usage_events WHERE user_id=?").bind(userId).first(),
  db.prepare("SELECT tier_override FROM users WHERE id=?").bind(userId).first(),
  db.prepare("SELECT * FROM progression_tiers ORDER BY threshold ASC,id ASC").all(),
  db.prepare("SELECT * FROM achievements WHERE enabled=1 ORDER BY metric,threshold,id").all(),
 ]);
 const songs=results[0].results||[],j=results[1]?.n||0,ai=results[2]?.n||0,m=results[3]?.n||0,shares=results[4]?.n||0,days=results[5]?.n||0;
 const stats={
  songs_started:songs.length,
  songs_finished:songs.filter(x=>x.status==="Finished").length,
  journal_entries:j,ai_sessions:ai,messages_sent:m,songs_shared:shares,
  lyric_words:songs.reduce((n,s)=>n+(s.lyrics?.trim()?s.lyrics.trim().split(/\s+/).length:0),0),
  missions_written:songs.filter(x=>x.mission?.trim()).length,
  scriptures_added:songs.filter(x=>x.scriptures?.trim()).length,
  days_active:days
 };
 const xp=stats.songs_started*12+stats.songs_finished*30+j*5+ai*3+m*2+shares*12+stats.missions_written*6+stats.scriptures_added*7+days*3+Math.floor(stats.lyric_words/100);
 const tiers=results[7].results||[], achievements=results[8].results||[];
 let tier=tiers[0]||{id:1,name:"First Spark",threshold:0,accent:"#d7b477"};
 for(const t of tiers){if(xp>=t.threshold)tier=t;}
 if(results[6]?.tier_override)tier=tiers.find(t=>t.id===results[6].tier_override)||tier;
 let nextTier=null;for(const t of tiers){if(t.threshold>xp){nextTier=t;break;}}
 const earned=[];
 if(withAwards){for(const a of achievements){if((stats[a.metric]||0)>=a.threshold){const put=await db.prepare("INSERT OR IGNORE INTO awarded_achievements(user_id,achievement_id,unlocked_at) VALUES(?,?,?)").bind(userId,a.id,now()).run();if(put.meta?.changes)earned.push(a.title);}}}
 const got=await db.prepare("SELECT achievement_id,unlocked_at FROM awarded_achievements WHERE user_id=?").bind(userId).all();
 const map=new Map((got.results||[]).map(x=>[x.achievement_id,x.unlocked_at]));
 const badges=achievements.map(a=>({...a,unlocked:map.has(a.id),unlocked_at:map.get(a.id)||null,progress:stats[a.metric]||0}));
 return {tier,xp,nextTier,stats,achievements:badges,newAwards:earned.slice(0,10),earnedCount:badges.filter(x=>x.unlocked).length,totalAchievements:badges.length,tiers};
}
const validId=s=>typeof s==="string" && /^[a-f0-9-]{36}$/.test(s);
async function featureApi(req,env,url,user){
 const db=env.DB,path=url.pathname,method=req.method;
 const current=await db.prepare("SELECT role,suspended,tier_override FROM users WHERE id=?").bind(user.id).first();
 if(!current || current.suspended)return reply({error:"This account has been disabled. Contact support."},403);
 const isAdmin=current.role==="admin";
 const requireAdmin=()=>isAdmin?null:reply({error:"Administrator access required."},403);
 if(path==="/api/heartbeat" && method==="POST"){
  const cookie=(req.headers.get("cookie")||"").match(/(?:^|;\s*)sc_session=([a-f0-9]{64})(?:;|$)/);
  if(cookie){const tokenHash=await sha256(cookie[1]),t=now();await db.prepare("UPDATE sessions SET last_seen=? WHERE token_hash=?").bind(t,tokenHash).run();await db.prepare("INSERT OR IGNORE INTO session_history(token_hash,user_id,started_at,last_seen) SELECT token_hash,user_id,created_at,? FROM sessions WHERE token_hash=?").bind(t,tokenHash).run();await db.prepare("UPDATE session_history SET last_seen=? WHERE token_hash=?").bind(t,tokenHash).run();}
  // One event per day from each account. Count a day of participating, not every heartbeat.
  const day=await db.prepare("SELECT 1 FROM usage_events WHERE user_id=? AND kind='visit' AND date(created_at,'unixepoch')=date('now') LIMIT 1").bind(user.id).first();
  if(!day)await eventLog(db,user.id,"visit");
  return reply({ok:true});
 }
 if(path==="/api/progression" && method==="GET")return reply(await progressFor(db,user.id,true));
 if(path==="/api/messages/unread" && method==="GET"){
  const u=await db.prepare("SELECT COUNT(*) AS n FROM dm_messages m JOIN dm_threads t ON t.id=m.thread_id LEFT JOIN dm_reads r ON r.thread_id=t.id AND r.user_id=? WHERE (t.user_a=? OR t.user_b=?) AND m.sender_id!=? AND m.created_at>COALESCE(r.read_at,0)").bind(user.id,user.id,user.id,user.id).first();
  return reply({count:u?.n||0});
 }
 if(path==="/api/messages/threads" && method==="GET"){
  const all=await db.prepare("SELECT t.id,t.created_at,CASE WHEN t.user_a=? THEN b.id ELSE a.id END AS other_id,CASE WHEN t.user_a=? THEN b.display_name ELSE a.display_name END AS other_name,CASE WHEN t.user_a=? THEN b.email ELSE a.email END AS other_email,(SELECT body FROM dm_messages WHERE thread_id=t.id ORDER BY created_at DESC,id DESC LIMIT 1) AS last_body,(SELECT MAX(created_at) FROM dm_messages WHERE thread_id=t.id) AS last_at,(SELECT COUNT(*) FROM dm_messages m WHERE m.thread_id=t.id AND m.sender_id!=? AND m.created_at>COALESCE((SELECT read_at FROM dm_reads WHERE thread_id=t.id AND user_id=?),0)) AS unread FROM dm_threads t JOIN users a ON a.id=t.user_a JOIN users b ON b.id=t.user_b WHERE t.user_a=? OR t.user_b=? ORDER BY COALESCE(last_at,t.created_at) DESC LIMIT 150").bind(user.id,user.id,user.id,user.id,user.id,user.id,user.id).all();
  return reply({threads:all.results||[]});
 }
 if(path==="/api/messages/threads" && method==="POST"){
   const b=await bodyJson(req),email=str(b.email,254).trim().toLowerCase();
   if(!safeEmail(email))return reply({error:"Enter the other songwriter's full email address."},400);
   const other=await db.prepare("SELECT id,display_name FROM users WHERE email=? AND suspended=0").bind(email).first();
   if(!other || other.id===user.id)return reply({error:"No other songwriter found with that email."},404);
   const ids=[user.id,other.id].sort(),id=crypto.randomUUID(),t=now();
   await db.prepare("INSERT OR IGNORE INTO dm_threads(id,user_a,user_b,created_at) VALUES(?,?,?,?)").bind(id,ids[0],ids[1],t).run();
   const found=await db.prepare("SELECT id FROM dm_threads WHERE user_a=? AND user_b=?").bind(ids[0],ids[1]).first();
   return reply({thread_id:found.id,other_name:other.display_name});
 }
 const chat=path.match(/^\/api\/messages\/threads\/([a-f0-9-]{36})\/messages$/);
 if(chat){
   const thread=await db.prepare("SELECT * FROM dm_threads WHERE id=? AND (user_a=? OR user_b=?)").bind(chat[1],user.id,user.id).first();
   if(!thread)return reply({error:"Conversation not found."},404);
   if(method==="GET"){
     const messages=await db.prepare("SELECT m.id,m.thread_id,m.sender_id,m.body,m.shared_title,m.shared_lyrics,m.created_at FROM dm_messages m WHERE m.thread_id=? ORDER BY m.created_at DESC,m.id DESC LIMIT 150").bind(thread.id).all();
     const t=Date.now();
     await db.prepare("INSERT INTO dm_reads(thread_id,user_id,read_at) VALUES(?,?,?) ON CONFLICT(thread_id,user_id) DO UPDATE SET read_at=excluded.read_at").bind(thread.id,user.id,t).run();
     return reply({messages:(messages.results||[]).reverse()});
   }
   if(method==="POST"){
     const b=await bodyJson(req),body=str(b.body,2000).trim(),songId=str(b.songId,40);
     if(!body && !songId)return reply({error:"Write a message or choose a song to share."},400);
     const allowed=await limit(db,"dm:"+user.id,90,3600);
     if(!allowed)return reply({error:"Message limit reached. Try again later."},429);
     let title=null,lyrics=null;
     if(songId){
        const s=await db.prepare("SELECT title,lyrics FROM songs WHERE id=? AND user_id=?").bind(songId,user.id).first();
        if(!s)return reply({error:"You can only share your own songs."},403);
        title=s.title;lyrics=s.lyrics.slice(0,20000);
     }
     const id=crypto.randomUUID(),t=Date.now();
     await db.prepare("INSERT INTO dm_messages(id,thread_id,sender_id,body,shared_title,shared_lyrics,created_at) VALUES(?,?,?,?,?,?,?)").bind(id,thread.id,user.id,body,title,lyrics,t).run();
     await eventLog(db,user.id,songId?"share":"message");
     return reply({message:{id,thread_id:thread.id,sender_id:user.id,body,shared_title:title,shared_lyrics:lyrics,created_at:t}},201);
   }
 }
 if(path==="/api/admin/overview" && method==="GET"){
   const denied=requireAdmin();if(denied)return denied;
   const [users,songs,active,spent,logs]=await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM users").first(),
      db.prepare("SELECT COUNT(*) AS n FROM songs").first(),
      db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM session_history WHERE ended_at IS NULL AND last_seen>?").bind(now()-300).first(),
      db.prepare("SELECT COUNT(*) AS calls,COALESCE(SUM(prompt_tokens),0) AS in_tokens,COALESCE(SUM(completion_tokens),0) AS out_tokens,COALESCE(SUM(cost_usd),0) AS estimated_usd FROM ai_call_logs").first(),
      db.prepare("SELECT kind,COUNT(*) AS n FROM usage_events GROUP BY kind ORDER BY n DESC").all()
   ]);
   return reply({users:users.n,songs:songs.n,active:active.n,ai:spent,events:logs.results||[],costNote:"USD estimate at logged per-model token rates; not OpenAI invoice."});
 }
 if(path==="/api/admin/accounts" && method==="GET"){
  const denied=requireAdmin();if(denied)return denied;
  const r=await db.prepare("SELECT u.id,u.email,u.display_name,u.role,u.suspended,u.tier_override,u.created_at,u.updated_at,(SELECT COUNT(*) FROM songs WHERE user_id=u.id) AS songs,(SELECT COUNT(*) FROM journal_entries WHERE user_id=u.id) AS journals,(SELECT COUNT(*) FROM dm_messages WHERE sender_id=u.id) AS messages,(SELECT COUNT(*) FROM ai_call_logs WHERE user_id=u.id) AS calls,(SELECT COALESCE(SUM(cost_usd),0) FROM ai_call_logs WHERE user_id=u.id) AS cost_usd,(SELECT MAX(last_seen) FROM session_history WHERE user_id=u.id) AS last_seen,(SELECT COUNT(*) FROM session_history WHERE user_id=u.id AND ended_at IS NULL AND last_seen>?) AS online_sessions FROM users u ORDER BY u.created_at DESC LIMIT 500").bind(now()-300).all();
  return reply({users:r.results||[]});
 }
 const account=path.match(/^\/api\/admin\/accounts\/([a-f0-9-]{36})$/);
 if(account){
   const denied=requireAdmin();if(denied)return denied;
   const id=account[1];
   if(method==="GET"){
     const [u,sessions,activity,ai]=await Promise.all([
       db.prepare("SELECT id,email,display_name,role,suspended,tier_override,created_at,updated_at FROM users WHERE id=?").bind(id).first(),
       db.prepare("SELECT started_at,last_seen,ended_at FROM session_history WHERE user_id=? ORDER BY started_at DESC LIMIT 50").bind(id).all(),
       db.prepare("SELECT kind,created_at FROM usage_events WHERE user_id=? ORDER BY created_at DESC LIMIT 75").bind(id).all(),
       db.prepare("SELECT model,prompt_tokens,completion_tokens,cached_tokens,cost_usd,created_at FROM ai_call_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(id).all()
     ]);
     if(!u)return reply({error:"Account not found."},404);
     const prog=await progressFor(db,id,false);
     return reply({user:u,sessions:sessions.results||[],activity:activity.results||[],ai_calls:ai.results||[],progress:{tier:prog.tier,xp:prog.xp,stats:prog.stats,earnedCount:prog.earnedCount}});
   }
   if(method==="PATCH"){
      const b=await bodyJson(req);
      if(id===user.id && b.suspended)return reply({error:"Cannot suspend your own admin account."},400);
      if(Object.hasOwn(b,"suspended")){
         await db.prepare("UPDATE users SET suspended=?,updated_at=? WHERE id=?").bind(b.suspended?1:0,now(),id).run();
         if(b.suspended){await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();await db.prepare("UPDATE session_history SET ended_at=? WHERE user_id=? AND ended_at IS NULL").bind(now(),id).run();}
      }
      if(Object.hasOwn(b,"tier_override")){
         const level=b.tier_override===null?null:Number(b.tier_override);
         if(level!==null && (!Number.isInteger(level) || !(await db.prepare("SELECT id FROM progression_tiers WHERE id=?").bind(level).first())))return reply({error:"Choose a valid tier."},400);
         await db.prepare("UPDATE users SET tier_override=?,updated_at=? WHERE id=?").bind(level,now(),id).run();
      }
      return reply({ok:true});
   }
 }
 if(path==="/api/admin/tiers" && method==="GET"){
   const denied=requireAdmin();if(denied)return denied;
   const r=await db.prepare("SELECT * FROM progression_tiers ORDER BY threshold,id").all();return reply({tiers:r.results||[]});
 }
 if(path==="/api/admin/tiers" && method==="POST"){
   const denied=requireAdmin();if(denied)return denied;
   const b=await bodyJson(req),name=str(b.name,50).trim(),threshold=Number(b.threshold),accent=/^#[0-9a-fA-F]{6}$/.test(b.accent)?b.accent:"#d7b477";
   if(!name||!Number.isInteger(threshold)||threshold<0||threshold>1000000)return reply({error:"Enter a name and valid nonnegative milestone."},400);
   const top=await db.prepare("SELECT MAX(id) AS maxid FROM progression_tiers").first(),id=(top?.maxid||0)+1;
   await db.prepare("INSERT INTO progression_tiers(id,name,threshold,accent,description) VALUES(?,?,?,?,?)").bind(id,name,threshold,accent,str(b.description,160)).run();
   return reply({ok:true,id},201);
 }
 const tier=path.match(/^\/api\/admin\/tiers\/(\d{1,6})$/);
 if(tier && method==="PATCH"){
   const denied=requireAdmin();if(denied)return denied;
   const b=await bodyJson(req),name=str(b.name,50).trim(),threshold=Number(b.threshold),accent=/^#[0-9a-fA-F]{6}$/.test(b.accent)?b.accent:"#d7b477";
   if(!name||!Number.isInteger(threshold)||threshold<0||threshold>1000000)return reply({error:"Invalid tier."},400);
   await db.prepare("UPDATE progression_tiers SET name=?,threshold=?,accent=?,description=? WHERE id=?").bind(name,threshold,accent,str(b.description,160),Number(tier[1])).run();
   return reply({ok:true});
 }
 if(path==="/api/admin/achievements" && method==="GET"){
   const denied=requireAdmin();if(denied)return denied;
   const r=await db.prepare("SELECT * FROM achievements ORDER BY metric,threshold,id").all();return reply({achievements:r.results||[]});
 }
 if(path==="/api/admin/achievements" && method==="POST"){
   const denied=requireAdmin();if(denied)return denied;
   const b=await bodyJson(req),metrics=["songs_started","songs_finished","journal_entries","ai_sessions","messages_sent","songs_shared","lyric_words","missions_written","scriptures_added","days_active"];
   if(!metrics.includes(b.metric)||!str(b.title,80).trim()||!Number.isInteger(Number(b.threshold))||Number(b.threshold)<1)return reply({error:"Enter a title, metric and positive goal."},400);
   const id=crypto.randomUUID();
   await db.prepare("INSERT INTO achievements(id,title,description,metric,threshold,icon,enabled) VALUES(?,?,?,?,?,?,1)").bind(id,str(b.title,80),str(b.description,180),b.metric,Number(b.threshold),str(b.icon,5)||"✦").run();
   return reply({ok:true,id},201);
 }
 const ach=path.match(/^\/api\/admin\/achievements\/([a-z0-9_-]{3,80})$/);
 if(ach && method==="PATCH"){
   const denied=requireAdmin();if(denied)return denied;
   const b=await bodyJson(req),metrics=["songs_started","songs_finished","journal_entries","ai_sessions","messages_sent","songs_shared","lyric_words","missions_written","scriptures_added","days_active"];
   if(!metrics.includes(b.metric)||!str(b.title,80).trim()||!Number.isInteger(Number(b.threshold))||Number(b.threshold)<1)return reply({error:"Invalid achievement."},400);
   await db.prepare("UPDATE achievements SET title=?,description=?,metric=?,threshold=?,icon=?,enabled=? WHERE id=?").bind(str(b.title,80),str(b.description,180),b.metric,Number(b.threshold),str(b.icon,5)||"✦",b.enabled===false?0:1,ach[1]).run();
   return reply({ok:true});
 }
 return null;
}
