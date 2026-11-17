
// Polaris owner-visible dashboard approvals for request triage.
// This endpoint never writes code, opens a PR, merges, or deploys.
async function paOwnerDecision(req,env){
 if(req.method!=="POST")return paChangeJson({ok:false,error:"POST required"},405);
 if(!paSafeOrigin(req))return paChangeJson({ok:false,error:"Open Polaris on its official website to review this request."},403);
 const data=await paJsonInput(req,1000);
 if(!/^[0-9a-f-]{36}$/i.test(String(data?.id||""))||!["approve","reject"].includes(data?.decision))
  return paChangeJson({ok:false,error:"Invalid request ID or decision"},400);
 const status=data.decision==="approve"?"approved_for_preparation":"rejected";
 const now=new Date().toISOString();
 const updated=await env.POLARIS_DB.prepare("UPDATE polaris_change_requests SET status=?,updated_at=?,last_error=NULL WHERE id=? AND status='requested'").bind(status,now,data.id).run();
 if(!updated.meta?.changes)return paChangeJson({ok:false,error:"This request is no longer awaiting review. Refresh the dashboard."},409);
 try{await env.POLARIS_DB.prepare("INSERT INTO polaris_change_events(id,request_id,event_type,created_at,source) VALUES(?,?,?,?,?)")
  .bind(crypto.randomUUID(),data.id,status,now,"owner-browser").run()}catch(e){}
 return paChangeJson({ok:true,id:data.id,status,
  note:status==="approved_for_preparation"?"Approved for preparation. No code changes or deployment have been made.":"Request rejected. No project files changed."});
}
