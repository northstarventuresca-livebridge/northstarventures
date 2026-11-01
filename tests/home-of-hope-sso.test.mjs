import test from "node:test";
import assert from "node:assert/strict";
import {handleHomeOfHopeLaunch} from "../home-of-hope-sso.js";

const SITE="https://northstarventures.ca", PATH="/api/admin/launch/hoh";
function makeEnv(configured=true){
 const store=new Map();let calls=0;
 const ticket="a".repeat(64);
 return {
  INBOX:{get:async k=>store.get(k),put:async(k,v)=>{store.set(k,v)}},
  HOH_SSO_RPC:configured?{issueOwnerTicket:async()=>{calls++;return {ticket}}}:undefined,
  get rpcCalls(){return calls}
 };
}
function request(origin=SITE,method="POST"){
 return new Request(SITE+PATH,{method,headers:{origin,authorization:"Bearer logged-in-admin"}});
}
function check(req,env,auth=async()=>true){
 return handleHomeOfHopeLaunch(req,env,new URL(req.url),auth);
}
test("does not handle any other app route",async()=>{
 const req=new Request(SITE+"/api/admin/launch/nope",{method:"POST"});
 assert.equal(await check(req,makeEnv()),null);
});
test("rejects GET, invalid Origin and missing authorization",async()=>{
 assert.equal((await check(request(SITE,"GET"),makeEnv())).status,405);
 assert.equal((await check(request("https://evil.example"),makeEnv())).status,403);
 assert.equal((await check(request(),makeEnv(),async()=>false)).status,401);
});
test("fails closed if Home of Hope RPC isn't connected",async()=>{
 assert.equal((await check(request(),makeEnv(false))).status,503);
});
test("returns a fixed HOH destination and a one-time ticket",async()=>{
 const env=makeEnv();
 const response=await check(request(),env);
 assert.equal(response.status,200);
 assert.equal(response.headers.get("cache-control"),"private, no-store");
 const body=await response.json();
 assert.equal(body.launch_url,"https://hoh.northstarventures.ca/sso#ticket="+"a".repeat(64));
 assert.equal(env.rpcCalls,1);
});
test("rejects malformed tickets from the integration",async()=>{
 const env=makeEnv();
 env.HOH_SSO_RPC.issueOwnerTicket=async()=>({ticket:"not-a-real-ticket"});
 assert.equal((await check(request(),env)).status,502);
});
test("does not expose private RPC errors",async()=>{
 const env=makeEnv();
 env.HOH_SSO_RPC.issueOwnerTicket=async()=>{throw Error("secret-handshake-error")};
 const response=await check(request(),env);
 assert.equal(response.status,503);
 assert.doesNotMatch(JSON.stringify(await response.json()),/secret-handshake-error/);
});
test("throttles repeat requests from a session",async()=>{
 const env=makeEnv();let response;
 for(let i=0;i<7;i++)response=await check(request(),env);
 assert.equal(response.status,429);assert.equal(env.rpcCalls,6);
});
