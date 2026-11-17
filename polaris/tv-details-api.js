
// Owner-authenticated QR deep-link details for a specific TV display revision.
async function pcTvDetailsApi(env,url){
 if(!env.POLARIS_DB)return pcVoiceReply({error:"Polaris display unavailable"},503);
 const rev=url.searchParams.get("rev");
 if(rev!==null&&!/^[0-9]{1,12}$/.test(rev))return pcVoiceReply({error:"Invalid display revision"},400);
 const sql=rev!==null?
  "SELECT revision,view,project,title,subtitle,payload,updated_at FROM polaris_display_history WHERE revision=?":
  "SELECT revision,view,project,title,subtitle,payload,updated_at FROM polaris_display_state WHERE id='main'";
 const row=rev!==null?await env.POLARIS_DB.prepare(sql).bind(Number(rev)).first():
  await env.POLARIS_DB.prepare(sql).first();
 if(!row)return pcVoiceReply({error:rev===null?"No display details available":"That older display revision is no longer retained"},404);
 const site=pcProjectSite(row.project);
 return pcVoiceReply({ok:true,state:row,siteUrl:site&&pcSiteSafeUrl(site.url)?site.url:null});
}
