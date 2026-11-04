// Real Chromium interactions against the current Command Center UI with an isolated
// local API fixture. NO production forms, users, databases or mixer controls are changed.
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { PROJECT_HUB_WIDGET } from "../projects-hub-ui.js";
import { DIAGNOSTICS_WIDGET } from "../diagnostics-hub-ui.js";
import { DIAGNOSTICS_CLIENT } from "../diagnostics-client.js";

const projects=[
 {id:"seed-05",name:"TapBin",category:"Software Products",status:"Live",priority:"Normal",description:"Inventory",other:false,pinned:false},
 {id:"seed-18",name:"Say It With Flours",category:"Client Websites",status:"Live",priority:"Normal",description:"Bakery",other:true,pinned:false},
 {id:"seed-07",name:"North Star Ventures Website",category:"Internal Tools",status:"Live",priority:"Focus",description:"Command Center",other:false,pinned:false}
];
const html='<!doctype html><html><head><meta charset="utf-8"></head><body>'+
 '<div id="dash"><div id="nsv-card-nav"><button type="button" data-view="projects">Projects</button></div></div>'+
 PROJECT_HUB_WIDGET+DIAGNOSTICS_WIDGET+DIAGNOSTICS_CLIENT+'</body></html>';
const server=createServer((req,res)=>{
 res.writeHead(200,{"content-type":"text/html; charset=utf-8"});
 res.end(html);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const errors=[];
let runCount=0,telemetryCount=0;
page.on("pageerror",error=>errors.push(error.message));
page.route("**/api/admin/**",async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;
 const respond=body=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
 if(path==="/api/admin/projects"&&req.method()==="GET")return respond({
   projects,categories:["Software Products","Client Websites","Internal Tools"],
   statuses:["Live","Building","Needs review"],priorities:["Focus","Normal","Later"]});
 if(path==="/api/admin/diagnostics"&&req.method()==="GET")return respond({projects:projects.map(p=>({
   id:p.id,name:p.name,category:p.category,other:p.other,
   configured:p.id==="seed-07",checkCount:p.id==="seed-07"?2:0,
   latest:p.id==="seed-07"&&runCount?{startedAt:new Date().toISOString(),status:"passed"}:null
 }))});
 if(path==="/api/admin/diagnostics/seed-07"&&req.method()==="GET")return respond({
   project:projects[2],configured:true,checks:[{id:"public-home",group:"regression"}],
   history:runCount?[{startedAt:new Date().toISOString(),status:"passed"}]:[],
   latest:runCount?{startedAt:new Date().toISOString(),status:"passed",checks:[{id:"public-home",group:"regression",detail:"HTTP 200",status:"passed"}]}:null,
   automaticErrorCollection:true,
   browserErrors:[{createdAt:new Date().toISOString(),route:"/admin",kind:"javascript",code:"TypeError",message:"Example captured error"}]
 });
 if(path==="/api/admin/diagnostics/seed-07/run"&&req.method()==="POST"){
   runCount++;
   return respond({report:{id:"fixture",status:"passed",checks:[]}});
 }
 if(path==="/api/admin/diagnostics/seed-07/events"&&req.method()==="POST"){
   telemetryCount++;return route.fulfill({status:201,contentType:"application/json",body:'{"ok":true}'});
 }
 return route.fulfill({status:404,body:'{"error":"fixture not configured"}'});
});
try{
 await page.addInitScript(()=>localStorage.setItem("ns_admin_token","fixture-only"));
 await page.goto(origin+"/admin",{waitUntil:"domcontentloaded"});
 await page.evaluate(()=>{document.getElementById("nsv-projects-view").style.display="block";window.NSV_PROJECTS_LOAD()});
 await page.locator("#ph-grid").getByText("TapBin").waitFor();
 assert.equal(await page.locator("#ph-grid").getByText("Say It With Flours").count(),0,"Other project leaked to Main");
 await page.locator("#ph-tab-others").click();
 await page.locator("#ph-grid").getByText("Say It With Flours").waitFor();
 assert.equal(await page.locator("#ph-grid").getByText("TapBin").count(),0,"Main project leaked to Others");
 await page.locator("#ph-tab-diagnostics").click();
 await page.locator('button[data-project="seed-07"]').waitFor();
 await page.locator('button[data-project="seed-07"]').click();
 await page.locator("#nd-detail").getByText("Captured browser errors").waitFor();
 await page.locator("#nd-run").click();
 await page.locator("#nd-message").getByText("Finished North Star Ventures Website checks.",{exact:false}).waitFor();
 assert.equal(runCount,1,"Run button did not invoke diagnostics endpoint exactly once");
 await page.evaluate(()=>window.dispatchEvent(new ErrorEvent("error",{
   message:"Synthetic UI test error",error:new TypeError("Synthetic UI test error")
 })));
 await page.waitForTimeout(250);
 assert.equal(telemetryCount,1,"Unexpected browser collector event count");
 assert.deepEqual(errors,[],"Browser JavaScript errors during UI tests");
 console.log("PASS: Real browser clicked Main/Others, Diagnostics, Details, Run; captured synthetic error");
}finally{await page.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
