// Polaris v2.4: owner-approved import of ChatGPT "conversations.json".
// The OpenAI API does not grant direct access to personal ChatGPT chat history.
// This UI extracts text only from an explicitly selected local export file.
(function(){
"use strict";
var host=document.getElementById("polarisProjectContextRow");
if(!host)return;
var importButton=document.createElement("button");
importButton.type="button";importButton.id="polarisHistoryImportBtn";
importButton.className="btn ghost";importButton.textContent="IMPORT CHATGPT HISTORY";
importButton.style.cssText="font-size:10px;padding:8px 10px;white-space:nowrap;flex-shrink:0";
host.appendChild(importButton);
var input=document.createElement("input");
input.type="file";input.accept=".json,application/json";input.id="polarisChatGPTFile";
input.style.display="none";document.body.appendChild(input);
var box=document.createElement("div");
box.id="polarisImportStatus";
box.style.cssText="max-width:760px;margin:2px auto 8px;display:none;border:1px solid #256a8e90;background:#0a1d30;border-radius:9px;padding:10px 13px;font-size:11px;color:#b3dce8;line-height:1.5";
host.parentNode.insertBefore(box,host.nextSibling);
var clearButton=document.createElement("button");
clearButton.type="button";clearButton.id="polarisDeleteImportedHistory";
clearButton.textContent="DELETE IMPORTED CHATGPT HISTORY";
clearButton.style.cssText="display:none;margin:4px auto 9px;border:1px solid #a84a597a;color:#f2bbc0;background:#37182788;border-radius:7px;padding:8px 11px;font-size:10px;cursor:pointer";
box.parentNode.insertBefore(clearButton,box.nextSibling);
var busy=false;
function status(text){box.style.display="block";box.textContent=text}
function classify(title,preview){
 var t=String(title||"").toLowerCase(),p=String(preview||"").toLowerCase().slice(0,2500);
 var aliases=[
  ["X32 AI Engineer",/\bx32\b|dante|voice\s?eq|audio engineer|mix32/i],
  ["HOH HUB",/\bhoh\b|home of hope|sponsorship admin|child sponsorship/i],
  ["LiveBridge",/livebridge|live bridge|live transcription|listener broadcast/i],
  ["TapBin",/tapbin|tap bin|northstar.organizer|nfc card access/i],
  ["Songwriters Compass",/songwriters compass|songwriter|song writing|theological song|compass website/i],
  ["Polaris",/\bpolaris\b|jarvis voice assistant/i],
  ["Healing The Heart",/healing the heart|\bhth\b|class roster/i],
  ["Great Church",/great church|greatchurch/i],
  ["North Star Ventures",/northstarventures|north star ventures|\bnsv\b/i]
 ];
 for(var a of aliases)if(a[1].test(t))return a[0];
 for(var a of aliases)if(a[1].test(p))return a[0];
 return "Other / Client Projects";
}
function extract(data,includeOther){
 var conversations=Array.isArray(data)?data:Array.isArray(data?.conversations)?data.conversations:[];
 if(!conversations.length)throw Error("File is not a supported ChatGPT conversations.json export.");
 var messages=[],count=0;
 for(var conversation of conversations){
  var title=String(conversation.title||"Untitled conversation").slice(0,190);
  var id=String(conversation.id||conversation.conversation_id||"");
  var mapping=conversation.mapping;
  if(!id||!mapping||typeof mapping!=="object")continue;
  var records=Object.keys(mapping).map(function(key){
   var node=mapping[key],m=node?.message,role=m?.author?.role;
   if(role!=="user"&&role!=="assistant")return null;
   var parts=m?.content?.parts;
   if(!Array.isArray(parts))return null;
   var text=parts.map(function(p){return typeof p==="string"?p:typeof p?.text==="string"?p.text:""}).filter(Boolean).join("\n").trim();
   if(!text)return null;
   return {id:String(key),role,content:text.slice(0,4500),created:Number(m.create_time||conversation.create_time||0)};
  }).filter(Boolean);
  if(!records.length)continue;
  records.sort(function(a,b){return a.created-b.created});
  var sample=records.filter(function(x){return x.role==="user"}).slice(0,9).map(function(x){return x.content.slice(0,400)}).join(" ");
  var project=classify(title,sample);
  if(project==="Other / Client Projects"&&!includeOther)continue;
  count++;
  // Limit very large chats to 180 recent user/assistant messages to keep private
  // import manageable on mobile; original export remains unchanged on the device.
  for(var m of records.slice(-180)){
   var messageId=id+"_"+m.id;
   if(messageId.length>150)messageId=messageId.slice(0,150);
   if(messageId.length<12)continue;
   messages.push({id:messageId,conversation_id:id,project,title,role:m.role,content:m.content,message_time:m.created?new Date(m.created*1000).toISOString():""});
  }
 }
 return {conversations:count,messages};
}
async function updateStatus(){
 try{
  var r=await fetch("/api/import-status",{cache:"no-store"});
  if(!r.ok)return;
  var d=await r.json();
  var projects=d.projects||[];
  var num=projects.reduce(function(sum,x){return sum+Number(x.messages||0)},0);
  importButton.textContent=num?"CHATGPT HISTORY · "+num+" MESSAGES":"IMPORT CHATGPT HISTORY";
  clearButton.style.display=num?"block":"none";
 }catch(e){}
}
clearButton.addEventListener("click",async function(){
 if(busy)return;
 if(!window.confirm("Permanently delete every ChatGPT conversation previously imported into Polaris? Your original ChatGPT account and export files will not be changed."))return;
 busy=true;clearButton.disabled=true;
 try{
  var r=await fetch("/api/import-clear",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirm:"DELETE IMPORTED CHATGPT HISTORY"})});
  var data=await r.json();
  if(!r.ok||!data.ok)throw Error(data.error||"Delete failed");
  status("Imported ChatGPT history has been deleted from Polaris.");
  await updateStatus();
 }catch(e){status("Could not delete imported history: "+String(e.message||e))}
 finally{busy=false;clearButton.disabled=false}
});
importButton.addEventListener("click",function(){
 if(busy)return;
 status("Choose the conversations.json file from your ChatGPT data export. This creates an encrypted-in-transit private copy inside Polaris, not a live ChatGPT account connection. Only selected files are imported.");
 input.click();
});
input.addEventListener("change",async function(){
 if(busy)return;
 var file=input.files&&input.files[0];input.value="";
 if(!file)return;
 if(file.size>250*1024*1024){status("This export is larger than the 250 MB mobile import limit. Use a computer or a smaller conversations.json file.");return}
 busy=true;importButton.disabled=true;
 try{
  status("Reading "+file.name+" on your device…");
  var data=JSON.parse(await file.text());
  // Import work-related chats by default; user explicitly opts in to personal chats.
  var includeOther=window.confirm("Import all ChatGPT conversations, including unrelated or personal chats? Press Cancel to import only recognized project conversations (recommended).");
  var extracted=extract(data,includeOther);
  if(!extracted.messages.length)throw Error("No matching text conversations found.");
  if(!window.confirm("Import "+extracted.messages.length+" messages from "+extracted.conversations+" conversations into your private Polaris database? This may include sensitive information from those chats.")){status("Import cancelled. Nothing uploaded.");return}
  var done=0;
  for(var i=0;i<extracted.messages.length;i+=20){
   status("Importing ChatGPT project history: "+done+" / "+extracted.messages.length+" messages…");
   var segment=extracted.messages.slice(i,i+20);
   var r=await fetch("/api/import-history",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({messages:segment})});
   var res=await r.json();
   if(!r.ok||!res.ok)throw Error(res.error||"Import failed at message "+done);
   done+=Number(res.imported||0);
  }
  status("Imported "+done+" messages. Polaris can now search this snapshot of your ChatGPT projects. New ChatGPT conversations will need another import; the accounts are not live-synced.");
  await updateStatus();
 }catch(e){status("Import stopped: "+String(e.message||e).slice(0,220))}
 finally{busy=false;importButton.disabled=false}
});
updateStatus();
})();
