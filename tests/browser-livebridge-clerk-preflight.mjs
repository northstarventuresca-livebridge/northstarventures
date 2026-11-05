import { chromium } from "playwright";

const address = process.env.NSV_LB_STAGING_LOGIN_URL || "";
let target;
try { target = new URL(address); } catch { throw Error("Missing or invalid preview URL"); }
if (!/^livebridge[a-z0-9-]*\.northstarventures-ca\.workers\.dev$/.test(target.hostname) ||
    !/preview/.test(target.hostname) || target.pathname !== "/login/" || target.protocol !== "https:") {
  throw Error("REFUSED: browser API probe only permitted on LiveBridge isolated preview");
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const stats = { scriptResponse: null, pageErrors: 0 };
  page.on("pageerror", () => { stats.pageErrors++; });
  page.on("response", response => {
    let url;
    try { url = new URL(response.url()); } catch { return; }
    if (url.hostname === "clerk.livebridge.ca" && url.pathname.includes("clerk.browser.js")) {
      stats.scriptResponse = response.status();
    }
  });
  await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);
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
      statusError: (document.querySelector("#message")?.textContent || "").trim().length > 0
    };
  });
  console.log("CLERK_SAFE_PREFLIGHT " + JSON.stringify({ ...stats, ...found }));
  // No passwords or user details are loaded or used by this probe.
} finally {
  await browser.close();
}
