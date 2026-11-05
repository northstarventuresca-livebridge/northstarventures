// Safe real-browser check of password-only LiveBridge login on an isolated staging/preview host.
// Uses only a dedicated test account. Never prints or saves credentials, tokens or screenshots.
import fs from "node:fs";
import { chromium } from "playwright";

const endpoint = process.env.NSV_LB_STAGING_LOGIN_URL || "";
const email = process.env.NSV_LB_TEST_EMAIL || "";
const password = process.env.NSV_LB_TEST_PASSWORD || "";
const reportPath = "livebridge-staging-login-result.json";
const report = { project: "LiveBridge", check: "password-only-login", timestamp: new Date().toISOString(), status: "NOT_RUN", scope: null, reason: null };
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");

if (!endpoint || !email || !password) {
  report.reason = "Dedicated staging login URL and test credentials have not been configured";
  save();
  console.log("NOT RUN: LiveBridge staging credentials and URL must be configured in GitHub Actions");
  process.exit(0);
}

let target;
try { target = new URL(endpoint); } catch { throw Error("Invalid staging URL"); }
const host = target.hostname.toLowerCase();
if (
  target.protocol !== "https:" || target.username || target.password || target.search || target.hash ||
  !host.includes("livebridge") || !/(staging|stage|preview|qa)/.test(host) ||
  host === "livebridge.ca" || host === "www.livebridge.ca" ||
  !["/login/", "/login", "/account/", "/account"].includes(target.pathname)
) {
  throw Error("REFUSED: tests require a dedicated LiveBridge staging/preview host with /login/ or /account/ path");
}
if (/livebridge\.ca$/.test(host) && !host.startsWith("staging.") && !host.startsWith("preview.") && !host.startsWith("qa.")) {
  throw Error("REFUSED: production-domain login is not permitted");
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  let javascriptErrors = 0;
  page.on("pageerror", () => { javascriptErrors++; });

  await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 25000 });
  const previewEmail = page.locator("#email");
  const appToggle = page.locator("#lb-pw-open");
  await Promise.race([
    previewEmail.waitFor({ state: "visible", timeout: 30000 }),
    appToggle.waitFor({ state: "visible", timeout: 30000 })
  ]);
  const isPreview = await previewEmail.isVisible();
  report.scope = isPreview ? "preview-password-auth-only" : "staging-app-dashboard";

  if (isPreview) {
    // Older isolated password preview: tests Clerk password completion and isolated account policy,
    // but does NOT claim the real LiveBridge dashboard was opened.
    await previewEmail.fill(email);
    await page.locator("#pass").fill(password);
    await page.locator("#submit").click();
    await page.waitForFunction(() => {
      const status = document.querySelector("#message")?.textContent || "";
      return /Password sign-in successful/i.test(status) || /verification|error|not enabled|invalid|incorrect/i.test(status);
    }, { timeout: 25000 });
    const status = await page.locator("#message").innerText();
    if (!/Password sign-in successful/i.test(status)) {
      throw Error(/verif|code/i.test(status) ? "EMAIL_CODE_REQUIRED" : "PASSWORD_PREVIEW_LOGIN_FAILED");
    }
    const panel = page.locator("#content");
    await panel.waitFor({ state: "visible", timeout: 12000 });
    const policy = await panel.innerText();
    if (!/Password login enabled for this test account/i.test(policy)) throw Error("TEST_ACCOUNT_PASSWORD_POLICY_DISABLED");
  } else {
    // Actual staging site: confirm that a password directly establishes a Clerk session
    // and opens an account/admin dashboard without an email-code challenge.
    await appToggle.click();
    await page.locator("#lb-pw-email").fill(email);
    await page.locator("#lb-pw-secret").fill(password);
    await page.locator("#lb-pw-form button[type='submit']").click();
    try {
      await page.waitForFunction(() => {
        return Boolean(window.Clerk?.isSignedIn && window.Clerk?.session) &&
          /^\/(?:account|admin)\/?$/.test(location.pathname);
      }, { timeout: 30000 });
    } catch {
      const alert = await page.locator("#lb-pw-error").textContent().catch(() => "");
      throw Error(/verification|email.code|additional/i.test(alert || "") ? "EMAIL_CODE_REQUIRED" : "PASSWORD_DID_NOT_OPEN_DASHBOARD");
    }
  }
  if (javascriptErrors) throw Error("BROWSER_JAVASCRIPT_ERRORS");
  report.status = "PASS";
  report.reason = isPreview
    ? "Password login completed in isolated preview, without email code; live dashboard not verified"
    : "Password opened authenticated staging dashboard without email code";
  save();
  console.log("PASS: " + report.reason);
} catch (error) {
  report.status = "FAIL";
  // Fixed error categories only: never log DOM contents, email, password, cookies or tokens.
  const allowed = [
    "EMAIL_CODE_REQUIRED", "PASSWORD_PREVIEW_LOGIN_FAILED",
    "TEST_ACCOUNT_PASSWORD_POLICY_DISABLED", "PASSWORD_DID_NOT_OPEN_DASHBOARD",
    "BROWSER_JAVASCRIPT_ERRORS"
  ];
  report.reason = allowed.includes(error.message) ? error.message : "STAGING_BROWSER_TEST_FAILED";
  save();
  console.error("FAIL: " + report.reason);
  process.exitCode = 1;
} finally {
  await browser.close();
}
