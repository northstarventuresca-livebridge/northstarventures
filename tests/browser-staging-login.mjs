// Optional authenticated login flow against a dedicated staging environment.
// NEVER runs on production or against a real staff account.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const endpoint=process.env.NSV_DIAG_STAGING_URL||"";
const password=process.env.NSV_DIAG_STAGING_TEST_PASSWORD||"";
if(!endpoint||!password){
 console.log("NOT RUN: staging login requires isolated staging URL and dedicated test password");
 process.exit(0);
}
const target=new URL(endpoint);
if(target.protocol!=="https:"||target.username||target.password||target.search||target.hash||
   !/(?:staging|stage|preview|qa)/i.test(target.hostname)||
   target.hostname==="northstarventures.ca"){
 throw Error("Login tests are restricted to a dedicated staging host");
}
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 const errors=[];
 page.on("pageerror",e=>errors.push(e.name));
 await page.goto(target.origin+"/admin",{waitUntil:"domcontentloaded",timeout:20000});
 const pass=page.locator('input[type="password"]').first();
 await pass.waitFor({state:"visible",timeout:10000});
 await pass.fill(password);
 await page.locator('button[type="submit"]').first().click();
 await page.locator("#dash").waitFor({state:"visible",timeout:12000});
 assert.deepEqual(errors,[]);
 console.log("PASS: Dedicated staging account login rendered dashboard and had no JS errors");
}finally{await browser.close()}
