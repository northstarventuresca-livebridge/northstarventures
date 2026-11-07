/* Polaris v2.7 browser diagnostics. No screenshots, text input, passwords or stack traces are sent. */
(function(){
 var sent=0,seen={};
 function report(message,severity){
  if(sent>=4)return;
  var clean=String(message||"Unknown browser exception").replace(/[\u0000-\u001f\u007f]/g," ").slice(0,170);
  clean=clean.replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_-]{16,})\b/gi,"[REDACTED]");
  if(seen[clean])return;seen[clean]=true;sent++;
  fetch("/api/diagnostic",{method:"POST",credentials:"same-origin",keepalive:true,headers:{"content-type":"application/json"},body:JSON.stringify({project_key:"polaris",severity:severity||"error",summary:clean})}).catch(function(){});
 }
 window.addEventListener("error",function(event){
  if(event.target&&event.target!==window)return;
  report(event.message||"Unspecified JavaScript error","error");
 });
 window.addEventListener("unhandledrejection",function(event){
  var reason=event.reason;
  report("Unhandled promise: "+(reason&&reason.name?reason.name+": ":"")+(reason&&reason.message?reason.message:"No details"),"warning");
 });
})();
