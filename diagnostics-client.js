// North Star admin-only browser diagnostics. Only operational metadata is sent;
// no request bodies, credentials, form values, full URLs, or microphone data.
export const DIAGNOSTICS_CLIENT=String.raw`
<script id="nsv-admin-error-collector">
(function(){
 if(window.__nsvDiagnosticCollectorInstalled)return;
 window.__nsvDiagnosticCollectorInstalled=true;
 const endpoint='/api/admin/diagnostics/seed-07/events';
 const nativeFetch=window.fetch.bind(window);
 const seen=new Map();
 function loggedIn(){
   try{return !!localStorage.getItem('ns_admin_token')}catch{return false}
 }
 function safe(value){
   return String(value??'')
     .replace(/https?:\/\/[^\s"'<>]+/gi,'[url]')
     .replace(/(?:authorization|bearer|token|secret|api[_-]?key|password|cookie|session)\s*[:=]\s*[^\s&,;]+/gi,'[credential redacted]')
     .replace(/[A-Za-z0-9_-]{28,}/g,'[value]')
     .replace(/[?&#][a-z0-9_-]+=[^\s&,;]+/gi,'[parameter]')
     .slice(0,180);
 }
 function emit(kind,code,message,route){
   if(!loggedIn())return;
   const path=route||location.pathname;
   const cleanPath=/^\/[a-z0-9_./-]{0,150}$/i.test(path)?path:'/admin';
   const body={kind,code:safe(code).slice(0,80),message:safe(message),route:cleanPath};
   const key=kind+':'+body.code+':'+body.route+':'+body.message;
   const now=Date.now();
   if(seen.get(key)>now-10000)return;
   seen.set(key,now);
   if(seen.size>80)seen.clear();
   const token=localStorage.getItem('ns_admin_token')||'';
   nativeFetch(endpoint,{method:'POST',credentials:'same-origin',keepalive:true,
     headers:{'content-type':'application/json',authorization:'Bearer '+token},
     body:JSON.stringify(body)}).catch(()=>{});
 }
 window.addEventListener('error',function(event){
   if(event.target!==window)return;
   const name=event.error?.name||'JavaScriptError';
   emit('javascript',name,event.message||'Uncaught browser error');
 });
 window.addEventListener('unhandledrejection',function(event){
   const reason=event.reason||{};
   emit('promise',reason.name||'UnhandledRejection',reason.message||'Unhandled promise rejection');
 });
 window.fetch=function(input,options){
   let path='';
   try{
     const raw=typeof input==='string'?input:input?.url;
     const url=new URL(raw,location.origin);
     if(url.origin===location.origin&&url.pathname.startsWith('/api/admin/')&&
        !url.pathname.startsWith('/api/admin/diagnostics/')&&
        url.pathname!=='/api/admin/login'&&url.pathname!=='/api/admin/logout')
       path=url.pathname;
   }catch{}
   return nativeFetch(input,options).then(response=>{
     if(path&&response.status>=500)emit('api','HTTP'+response.status,'Admin API failed',path);
     return response;
   },error=>{
     if(path)emit('api','NetworkError',error?.name||'API request failed',path);
     throw error;
   });
 };
})();
</script>
`;
