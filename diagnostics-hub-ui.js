// Adds a real Diagnostics tab to the existing Projects & Apps dashboard.
// Does not alter other project pages, authentication, or front-end routing.
export const DIAGNOSTICS_WIDGET=String.raw`
<style>
#ns-diagnostics{display:none;color:#193448}
#ns-diagnostics .nd-info{font-size:13px;color:#627588;margin:8px 0 15px;line-height:1.6}
#ns-diagnostics .nd-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#ns-diagnostics .nd-card,#ns-diagnostics .nd-panel{border:1px solid #d5dfe7;border-radius:14px;background:white;padding:17px}
#ns-diagnostics .nd-card h3{font-size:17px;margin:0 0 6px}
#ns-diagnostics .nd-card p{font-size:12px;color:#6a7c8a;margin:5px 0 12px}
#ns-diagnostics .nd-badge{font-size:11px;font-weight:750;color:#476078;background:#f0f4f7;border-radius:20px;padding:5px 9px}
#ns-diagnostics .nd-badge.pass{background:#e7f6ec;color:#27633c}
#ns-diagnostics .nd-badge.fail{background:#ffebeb;color:#9c3030}
#ns-diagnostics .nd-actions{display:flex;align-items:center;gap:10px;justify-content:space-between}
#ns-diagnostics button{cursor:pointer;border-radius:9px;border:1px solid #ccdae2;background:#163650;color:white;font-size:12px;padding:9px 12px;font-weight:700}
#ns-diagnostics button:disabled{opacity:.55;cursor:not-allowed}
#ns-diagnostics .nd-toolbar{display:flex;gap:9px;align-items:center;margin:15px 0;flex-wrap:wrap}
#ns-diagnostics .nd-toolbar input{flex:1;min-width:160px;padding:10px;border-radius:9px;border:1px solid #d0dce5}
#ns-diagnostics .nd-panel{margin:16px 0}
#ns-diagnostics .nd-panel h3{margin:0 0 12px}
#ns-diagnostics .nd-result{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #eef2f5;padding:9px 0;font-size:13px}
#ns-diagnostics .nd-result:last-child{border-bottom:0}
#ns-diagnostics .nd-muted{color:#708393;font-size:12px}
@media(max-width:720px){#ns-diagnostics .nd-grid{grid-template-columns:1fr}}
</style>
<script id="ns-diagnostics-script">
(function(){
 const parent=document.getElementById('nsv-projects-view');
 if(!parent)return;
 const tabs=parent.querySelector('.ph-tabs');
 if(!tabs)return;
 const tab=document.createElement('button');
 tab.id='ph-tab-diagnostics';tab.type='button';tab.setAttribute('role','tab');
 tab.setAttribute('aria-selected','false');tab.textContent='Testing & Diagnostics';
 tabs.appendChild(tab);
 const panel=document.createElement('section');panel.id='ns-diagnostics';
 panel.innerHTML='<h2>Testing & Diagnostics</h2><p class="nd-info">Run safe, read-only website response checks for individual projects. These are NOT full browser, login, button, or X32 hardware tests. Projects without configured checks show Not configured.</p><div class="nd-toolbar"><input id="nd-search" type="search" placeholder="Find a project..." aria-label="Search diagnostic projects"><button id="nd-refresh" type="button">Refresh</button></div><p class="nd-info" id="nd-message" role="status"></p><div class="nd-grid" id="nd-list"></div><div id="nd-detail"></div>';
 parent.appendChild(panel);
 const get=id=>document.getElementById(id);
 const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 let projects=[],selected='',active=false;
 const regular=[...parent.children].filter(x=>x!==panel&&x!==tabs&&!x.classList.contains('ph-hero'));
 function setActive(value){
   active=value;
   panel.style.display=value?'block':'none';
   for(const x of regular)x.style.display=value?'none':'';
   tab.setAttribute('aria-selected',String(value));
 }
 async function api(path,options={}){
   const token=localStorage.getItem('ns_admin_token')||'';
   const r=await fetch(path,{...options,headers:{...(options.headers||{}),authorization:'Bearer '+token}});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(data.error||'Request failed');
   return data;
 }
 const status=v=>v==='passed'?'Passed':v==='failed'?'Failed':'Not run';
 const badge=(v)=>'<span class="nd-badge '+(v==='passed'?'pass':v==='failed'?'fail':'')+'">'+status(v)+'</span>';
 const time=t=>t?new Date(t).toLocaleString():'Never';
 function draw(){
   const q=get('nd-search').value.trim().toLowerCase();
   const shown=projects.filter(p=>(p.name+' '+p.category).toLowerCase().includes(q));
   get('nd-list').innerHTML=shown.map(p=>'<article class="nd-card"><div class="nd-actions"><h3>'+esc(p.name)+'</h3>'+badge(p.latest?.status)+'</div><p>'+esc(p.category||'Project')+' · '+(p.configured?p.checkCount+' read-only check(s)':'Not configured')+'</p><div class="nd-actions"><span class="nd-muted">Last run: '+esc(time(p.latest?.startedAt))+'</span><button type="button" data-project="'+esc(p.id)+'">Details</button></div></article>').join('')||'<div class="nd-card">No matching projects.</div>';
 }
 async function reload(){
   const data=await api('/api/admin/diagnostics');
   projects=data.projects||[];draw();
 }
 function reportHtml(report){
   if(!report)return '<p class="nd-muted">No previous results for this project.</p>';
   const items=report.checks||[];
   return '<div class="nd-panel"><div class="nd-actions"><h3>Latest result</h3>'+badge(report.status)+'</div><p class="nd-muted">Read-only HTTP checks · '+esc(time(report.startedAt))+'</p>'+items.map(c=>'<div class="nd-result"><span>'+esc(c.id)+' <span class="nd-muted">('+esc(c.group)+')</span></span><span>'+esc(c.detail)+' · '+esc(c.status)+'</span></div>').join('')+'</div>';
 }
 async function details(id){
   selected=id;const data=await api('/api/admin/diagnostics/'+id);
   get('nd-detail').innerHTML='<div class="nd-panel"><div class="nd-actions"><h3>'+esc(data.project.name)+'</h3><button id="nd-run" type="button" '+(!data.configured?'disabled':'')+'>Run Read-only Tests</button></div><p class="nd-info">'+(data.configured?'Checks only whether approved website pages respond. Does not verify buttons, sign-in, or application functionality.':'No safe tests configured for this project yet. No result will be claimed.')+'</p></div>'+reportHtml(data.latest)+'<div class="nd-panel"><h3>Recent runs</h3>'+(data.history.length?data.history.map(r=>'<div class="nd-result"><span>'+esc(time(r.startedAt))+'</span>'+badge(r.status)+'</div>').join(''):'<p class="nd-muted">No test runs yet.</p>')+'</div>';
   get('nd-run').onclick=async()=>{
     const btn=get('nd-run');btn.disabled=true;btn.textContent='Running...';
     get('nd-message').textContent='Running safe checks for '+data.project.name+'...';
     try{
       await api('/api/admin/diagnostics/'+id+'/run',{method:'POST'});
       await reload();await details(id);
       get('nd-message').textContent='Finished '+data.project.name+' checks. See the results below.';
     }catch(e){get('nd-message').textContent=e.message;btn.disabled=false;btn.textContent='Run Read-only Tests';}
   };
 }
 tab.onclick=async()=>{setActive(true);try{await reload()}catch(e){get('nd-message').textContent=e.message}};
 for(const id of ['ph-tab-main','ph-tab-others'])get(id)?.addEventListener('click',()=>{setActive(false);get('nd-detail').innerHTML=''});
 get('nd-refresh').onclick=async()=>{try{await reload();if(selected)await details(selected)}catch(e){get('nd-message').textContent=e.message}};
 get('nd-search').oninput=draw;
 get('nd-list').onclick=e=>{const b=e.target.closest('button[data-project]');if(b)details(b.dataset.project).catch(e=>get('nd-message').textContent=e.message)};
})();
</script>
`;