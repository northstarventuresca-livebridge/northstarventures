import { chromium } from "playwright";

const address = process.env.NSV_LB_STAGING_LOGIN_URL || "";
let target;
try { target = new URL(address); } catch { throw Error("Missing or invalid preview URL"); }
if (target.hostname !== "password-preview.livebridge.ca" || target.pathname !== "/login/" || target.protocol !== "https:") {
  throw Error("REFUSED: browser API probe only permitted on LiveBridge isolated preview");
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const stats = { scriptResponse: null, uiScriptResponse: null, pageErrors: 0, clerkResponses: [], networkFailures: 0 };
  page.on("pageerror", () => { stats.pageErrors++; });
  page.on("requestfailed", request => { try { if (new URL(request.url()).hostname === "clerk.livebridge.ca") stats.networkFailures++; } catch {} });
  page.on("response", response => {
    let url;
    try { url = new URL(response.url()); } catch { return; }
    if (url.hostname === "clerk.livebridge.ca" && url.pathname.includes("clerk.browser.js")) stats.scriptResponse = response.status();
    if (url.hostname === "clerk.livebridge.ca" && url.pathname.includes("ui.browser.js")) stats.uiScriptResponse = response.status();
    if (url.hostname === "clerk.livebridge.ca" && url.pathname.includes("/v1/")) {
      const parts = url.pathname.split("/");
      const idx = parts.indexOf("v1");
      const name = parts[idx + 1];
      const type = ["client","environment","sign_ins","sessions","users","health"].includes(name) ? name : "other";
      stats.clerkResponses.push({type,status:response.status()});
    }
  });
  await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(8000);
  const found = await page.evaluate(() => {
    const c = window.Clerk;
    return {
      globalPresent: !!c,
      loaded: !!c?.loaded,
      browserLoad: typeof c?.load === "function",
      hasClient: !!c?.client,
      legacyPasswordMethod: typeof c?.client?.signIn?.create === "function",
      currentPasswordMethod: typeof c?.signIn?.password === "function",
      hasSignIn: !!c?.signIn,
      hasUiConstructor: typeof window.__internal_ClerkUICtor === "function",
      hasMountSignIn: typeof c?.mountSignIn === "function",
      formRendered: !!document.querySelector("#email"),
      statusError: (document.querySelector("#message")?.textContent || "").trim().length > 0,
      statusKind: /initialization incomplete/i.test(document.querySelector("#message")?.textContent || "") ? "SDK_INIT_INCOMPLETE" : /domain|origin/i.test(document.querySelector("#message")?.textContent || "") ? "DOMAIN_ORIGIN" : /network|fetch/i.test(document.querySelector("#message")?.textContent || "") ? "NETWORK" : "OTHER_OR_NONE"
    };
  });
  console.log("CLERK_SAFE_PREFLIGHT " + JSON.stringify({ ...stats, ...found }));
  // No passwords or user details are loaded or used by this probe.
} finally {
  await browser.close();
}
