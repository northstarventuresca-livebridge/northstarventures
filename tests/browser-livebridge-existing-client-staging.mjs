// Browser end-to-end test for an existing LiveBridge account on the isolated first-party staging frontend.
// Only dedicated test credentials from GitHub Secrets. No screenshots, credentials, tokens or user data logged.
import { chromium } from "playwright";

if (process.env.NSV_LB_DEDICATED_TEST_ACCOUNT !== "true" ||
    !process.env.NSV_LB_TEST_EMAIL ||
    !process.env.NSV_LB_TEST_PASSWORD) {
  console.log("NOT_RUN: Dedicated test account secrets/approval are required");
  process.exit(0);
}
const endpoint = "https://preview.livebridge.ca/account/";
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  let scriptErrors = 0;
  page.on("pageerror", () => { scriptErrors++; });
  await page.goto(endpoint, {waitUntil:"domcontentloaded",timeout:30000});
  const toggle = page.locator("#passwordLoginToggle");
  await toggle.waitFor({state:"visible",timeout:30000});
  await page.waitForFunction(() => window.__lbPasswordUpgradeReady === true, null, {timeout:20000});
  const script = await page.request.get("https://preview.livebridge.ca/account/password-login-upgrade.js");
  if (!script.ok()) throw Error("PASSWORD_UPGRADE_SCRIPT_MISSING");

  await toggle.click();
  const form = page.locator("#passwordLoginForm");
  await form.waitFor({state:"visible",timeout:8000});
  await page.locator("#passwordLoginEmail").fill(process.env.NSV_LB_TEST_EMAIL);
  await page.locator("#passwordLoginPassword").fill(process.env.NSV_LB_TEST_PASSWORD);
  await page.locator("#passwordLoginSubmit").click();

  try {
    await page.waitForFunction(() => {
      return !!window.Clerk?.isSignedIn && !!window.Clerk?.session &&
        !!window.Clerk?.user && !!document.getElementById("lb-dashboard") &&
        document.getElementById("lb-dashboard").style.display !== "none";
    }, null, {timeout:35000});
  } catch {
    const outcome = await page.evaluate(() => ({
      signedIn: !!window.Clerk?.isSignedIn,
      clerkLoaded: !!window.Clerk?.loaded,
      sessionPresent: !!window.Clerk?.session,
      clerkSessionCount: (window.Clerk?.client?.sessions || []).length,
      hasUser: !!window.Clerk?.user,
      backendAccountLoaded: !!window.liveBridgeServerAccount,
      activeOrgLoaded: !!window.liveBridgeAccount,
      setupCardVisible: !!document.getElementById("lb-password-onboarding") && !document.getElementById("lb-password-onboarding").hidden,
      dashboard: !!document.getElementById("lb-dashboard") &&
        document.getElementById("lb-dashboard").style.display !== "none",
      loginScreen: document.getElementById("lb-login-screen")?.style.display !== "none",
      errorShown: !!document.getElementById("passwordLoginError")?.textContent?.trim(),
      path: location.pathname === "/account" || location.pathname === "/account/" ? "account" : "other"
    })).catch(() => null);
    console.log("STAGING_LOGIN_STATUS " + JSON.stringify(outcome));
    const recovery = await page.evaluate(async () => {
      const clerk = window.Clerk;
      const session = clerk?.client?.sessions?.find(item => item?.status === "active") ||
        clerk?.client?.sessions?.[0];
      if (!session || typeof clerk?.setActive !== "function") return { attempted:false };
      try {
        await clerk.setActive({session:session.id});
        return {
          attempted:true,
          signedIn:!!clerk.isSignedIn,
          userPresent:!!clerk.user,
          activeSessionPresent:!!clerk.session
        };
      } catch { return {attempted:true, failed:true}; }
    }).catch(() => ({attempted:false, failed:true}));
    console.log("STAGING_SESSION_RECOVERY " + JSON.stringify(recovery));
    throw Error("PASSWORD_LOGIN_DID_NOT_OPEN_STAGING_DASHBOARD");
  }
  const banner = page.locator("#lb-password-onboarding");
  await banner.waitFor({state:"visible",timeout:12000});
  const bannerText = await banner.innerText();
  if (!/Password login is enabled|Set up password login/i.test(bannerText)) {
    throw Error("PASSWORD_SETUP_PROMPT_MISSING");
  }
  if (scriptErrors) throw Error("BROWSER_SCRIPT_ERRORS");
  console.log("PASS: Existing-client password login opened the authenticated staging dashboard without an email code, with the password setup/status card present.");
  await page.evaluate(() => window.Clerk?.signOut?.()).catch(() => {});
} catch (error) {
  const allowed = ["PASSWORD_UPGRADE_SCRIPT_MISSING","PASSWORD_LOGIN_DID_NOT_OPEN_STAGING_DASHBOARD","PASSWORD_SETUP_PROMPT_MISSING","BROWSER_SCRIPT_ERRORS"];
  console.error("FAIL: " + (allowed.includes(error.message) ? error.message : "STAGING_AUTH_BROWSER_FAILURE"));
  process.exitCode = 1;
} finally {
  await browser.close();
}