// POLARIS ChatGPT export bridge v2.4.
// The OpenAI API does NOT provide ChatGPT account history. User-approved export
// files are imported via authenticated endpoints into this private D1 journal.
// Never automatically import files from GitHub, Gmail, or other connected apps.
const POLARIS_IMPORT_PROJECTS=["Polaris","North Star Ventures","HOH HUB","LiveBridge","TapBin","Songwriters Compass","X32 AI Engineer","Great Church","Healing The Heart","Northstar Organizer","Other / Client Projects"];
function polarisImportClean(value,max){
 return String(value||"").slice(0,max).replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,})\b/g,"[REDACTED KEY]")
  .replace(/(\b(?:password|secret|api[_ -]?key|access[_ -]?code|access[_ -]?token)\b\s*(?:is|:|=)\s*)[^\s,;]{6,}/gi,"$1[REDACTED]");
}
async function polarisImportHistory(request,env){
 if(!env.POLARIS_DB)return json({error:"Private knowledge database unavailable"},503);
 let raw;try{raw=await request.text()}catch(e){return json({error:"Could not read import data"},400)}
 if(raw.length>130000)return json({error:"Import batch is too large. Reduce the batch size."},413);
 let data;try{data=JSON.parse(raw)}catch(e){return json({error:"Invalid import JSON"},400)}
 if(!Array.isArray(data?.messages)||data.messages.length<1||data.messages.length>25)return json({error:"Import 1–25 text messages per batch"},400);
 const sql="INSERT OR REPLACE INTO imported_chat_messages(id,conversation_id,project,title,role,content,message_time) VALUES(?,?,?,?,?,?,?)";
 const staged=[],ids=[];
 for(const m of data.messages){
  if(!m||typeof m!=="object")continue;
  const project=POLARIS_IMPORT_PROJECTS.includes(m.project)?m.project:"Other / Client Projects";
  const conversationId=String(m.conversation_id||"").slice(0,100);
  const id=String(m.id||"").slice(0,150);
  const role=m.role==="assistant"?"assistant":m.role==="user"?"user":"";
  const title=polarisImportClean(m.title,200),content=polarisImportClean(m.content,4600);
  const sentAt=String(m.message_time||"").slice(0,35);
  if(!/^[a-zA-Z0-9_-]{12,150}$/.test(id)||!role||!content.trim()||!conversationId)continue;
  staged.push({id,conversationId,project,title,role,content,sentAt});
  ids.push(id);
 }
 if(!staged.length)return json({error:"No valid text messages found in batch"},400);
 try{
  const writes=staged.map(m=>env.POLARIS_DB.prepare(sql).bind(m.id,m.conversationId,m.project,m.title,m.role,m.content,m.sentAt));
  await env.POLARIS_DB.batch(writes);
  const ftsSql="INSERT OR REPLACE INTO imported_chat_fts(rowid,content,title,project,message_id) VALUES((SELECT rowid FROM imported_chat_messages WHERE id=?),?,?,?,?)";
  await env.POLARIS_DB.batch(staged.map(m=>env.POLARIS_DB.prepare(ftsSql).bind(m.id,m.content,m.title,m.project,m.id)));
  return json({ok:true,imported:staged.length});
 }catch(e){return json({error:"Could not store imported messages"},502)}
}
async function polarisImportStatus(env){
 if(!env.POLARIS_DB)return json({error:"Private knowledge database unavailable"},503);
 try{
  const r=await env.POLARIS_DB.prepare("SELECT project,COUNT(*) AS messages,COUNT(DISTINCT conversation_id) AS conversations FROM imported_chat_messages GROUP BY project ORDER BY messages DESC").all();
  return json({projects:r.results||[],method:"user-approved ChatGPT conversations.json",automatic_sync:false});
 }catch(e){return json({error:"Could not read imported-history status"},502)}
}
async function polarisImportClear(request,env){
 if(!env.POLARIS_DB)return json({error:"Private knowledge database unavailable"},503);
 let data;try{data=await request.json()}catch(e){return json({error:"Invalid request"},400)}
 if(data?.confirm!=="DELETE IMPORTED CHATGPT HISTORY")return json({error:"Explicit confirmation required"},400);
 try{
  await env.POLARIS_DB.prepare("DELETE FROM imported_chat_messages").run();
  await env.POLARIS_DB.prepare("DELETE FROM imported_chat_fts").run();
  return json({ok:true,deleted:true});
 }catch(e){return json({error:"Could not clear imported ChatGPT history"},502)}
}
async function polarisSearchImportedChats(env,project,question){
 if(!env.POLARIS_DB||!project)return "";
 const tokens=[...new Set(String(question||"").toLowerCase().split(/[^a-z0-9]+/).filter(t=>t.length>=3&&!["how","what","the","our","you","can","were","did","for","from","with","about","please","tell","those","this","that","your","these","last","earlier"].includes(t)))].slice(0,8);
 if(!tokens.length)return "";
 try{
  const search=tokens.map(t=>'"'+t+'"*').join(" OR ");
  const rows=await env.POLARIS_DB.prepare("SELECT m.project,m.title,m.role,m.content,m.message_time,m.conversation_id FROM imported_chat_fts f JOIN imported_chat_messages m ON m.rowid=f.rowid WHERE imported_chat_fts MATCH ? AND m.project=? ORDER BY bm25(imported_chat_fts) ASC LIMIT 8").bind(search,project).all();
  const hits=rows.results||[];
  if(!hits.length)return "";
  return "[USER-IMPORTED CHATGPT HISTORY — this is a point-in-time copy, not live ChatGPT access]\n"+
   hits.map(r=>"Chat title: "+r.title+" · "+(r.message_time||"undated")+" · "+r.role+"\n"+String(r.content).slice(0,1800)).join("\n\n").slice(0,9200);
 }catch(e){return ""}
}
