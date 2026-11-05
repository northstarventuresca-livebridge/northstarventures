// Safe real-browser check of password-only LiveBridge login on an isolated staging/preview host.
// Uses only a dedicated test account. Never prints or saves credentials, tokens or screenshots.
import fs from "node:fs";
import { chromium } from "playwright";

const endpoint = process.env.NSV_LB_STAGING_LOGIN_URL || "";
const email = process.env.NSV_LB_TEST_EMAIL || "";
const password = process.env.NSV_LB_TEST_PASSWORD || "";
const dedicatedTestAccountConfirmed = process.env.NSV_LB_DEDICATED_TEST_ACCOUNT === "true";
const reportPath = "livebridge-staging-login-result.json";
const report = { project: "LiveBridge", check: "password-only-login", timestamp: new Date().toISOString(), status: "NOT_RUN", scope: null, reason: null };
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");

if (!endpoint || !email || !password || !dedicatedTestAccountConfirmed) {
  report.reason = dedicatedTestAccountConfirmed ? "Dedicated staging login URL and test credentials have not been configured" : "Dedicated test-only identity not confirmed; no sign-in attempted";
  save();
  console.log("NOT RUN: Dedicated LiveBridge test-only identity must be confirmed before automated sign-in");
  process.exit(0);
}

let target;
try { target = new URL(endpoint); } catch { throw Error("Invalid staging URL"); }
const host = target.hostname.toLowerCase();
if (
  target.protocol !== "https:" || target.username || target.password || target.search || target.hash ||
  host !== "password-preview.livebridge.ca" || target.pathname !== "/login/"
) {
  throw Error("REFUSED: authentication tests require the dedicated first-party LiveBridge password preview");
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  let javascriptErrors = 0;
  page.on("pageerror", () => { javascriptErrors++; });
  // Record only safe outcome codes/statuses. Never log request bodies, response text,
  // identifiers, passwords, sessions, full URLs or raw Clerk messages.
  const clerkSignals = { authStatus: null, errorCode: null, policyStatus: null, authRequestSent: false, authNetworkFailed: false };
  const pendingChecks = [];
  const permittedCodes = new Set([
    "form_password_incorrect",
    "form_password_or_identifier_incorrect",
    "form_password_validation_failed",
    "form_identifier_not_found",
    "form_param_format_invalid",
    "form_param_nil",
    "form_password_compromised",
    "session_exists",
    "strategy_for_user_invalid"
  ]);
  function isSignInCall(request) {
    try {
      const url = new URL(request.url());
      return url.hostname === "clerk.livebridge.ca" &&
        url.pathname.includes("/client/sign_ins") && request.method() === "POST";
    } catch { return false; }
  }
  page.on("request", request => {
    if (isSignInCall(request)) clerkSignals.authRequestSent = true;
  });
  page.on("requestfailed", request => {
    if (isSignInCall(request)) clerkSignals.authNetworkFailed = true;
  });
  page.on("response", response => {
    let url;
    try { url = new URL(response.url()); } catch { return; }
    if (url.origin === target.origin && url.pathname === "/api/policy") {
      clerkSignals.policyStatus = response.status();
      return;
    }
    if (url.hostname !== "clerk.livebridge.ca" || !url.pathname.includes("/client/sign_ins")) return;
    // Only authentication HTTP status and whitelisted Clerk error code are kept.
    if (response.request().method() !== "POST") return;
    clerkSignals.authStatus = response.status();
    if (response.status() >= 400) {
      pendingChecks.push(response.json().then(data => {
        for (const item of Array.isArray(data?.errors) ? data.errors : []) {
          if (permittedCodes.has(item?.code)) {
            clerkSignals.errorCode = item.code;
            break;
          }
        }
      }).catch(() => {}));
    }
  });
  async function resolveAuthFailure(message) {
    await Promise.allSettled(pendingChecks);
    if (clerkSignals.errorCode === "form_password_incorrect") return "CLERK_PASSWORD_INCORRECT";
    if (clerkSignals.errorCode === "form_password_or_identifier_incorrect") return "CLERK_PASSWORD_OR_IDENTIFIER_INCORRECT";
    if (clerkSignals.errorCode === "form_identifier_not_found") return "CLERK_IDENTIFIER_NOT_FOUND";
    if (clerkSignals.errorCode === "form_password_validation_failed") return "CLERK_PASSWORD_VALIDATION_FAILED";
    if (clerkSignals.errorCode === "strategy_for_user_invalid") return "CLERK_PASSWORD_STRATEGY_UNAVAILABLE";
    if (clerkSignals.authStatus === 429) return "CLERK_RATE_LIMITED";
    if (clerkSignals.authStatus === 401 || clerkSignals.authStatus === 403) return "CLERK_AUTH_DENIED";
    if (clerkSignals.authStatus === 422) return "CLERK_AUTH_VALIDATION_FAILED";
    if (clerkSignals.policyStatus && clerkSignals.policyStatus >= 400) return "PREVIEW_POLICY_API_REJECTED";
    if (clerkSignals.authNetworkFailed) return "CLERK_SIGN_IN_NETWORK_FAILURE";
    if (!clerkSignals.authRequestSent && clerkSignals.authStatus === null) return "CLERK_SIGN_IN_NOT_SUBMITTED";
    if (clerkSignals.authRequestSent && clerkSignals.authStatus === null) return "CLERK_SIGN_IN_NO_RESPONSE";
    if (clerkSignals.authStatus && clerkSignals.authStatus < 400) return "CLERK_SIGN_IN_RESPONDED_BUT_UI_FAILED";
    if (/verif|code|additional step|second factor/i.test(message)) return "EMAIL_CODE_REQUIRED";
    if (/not enabled|policy/i.test(message)) return "TEST_ACCOUNT_PASSWORD_POLICY_DISABLED";
    if (/incorrect password|password is incorrect/i.test(message)) return "CLERK_PASSWORD_INCORRECT";
    if (/password or email.*incorrect|email or password.*incorrect/i.test(message)) return "CLERK_PASSWORD_OR_IDENTIFIER_INCORRECT";
    return "AUTH_REJECTED_OR_UNEXPECTED";
  }

  report.scope = "preview-password-auth-only";
  try { await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 25000 }); }
  catch { throw Error("PREVIEW_PAGE_NOT_REACHABLE"); }
  const previewEmail = page.locator("#email");
  const appToggle = page.locator("#lb-pw-open");
  try {
    await Promise.race([
      previewEmail.waitFor({ state: "visible", timeout: 30000 }),
      appToggle.waitFor({ state: "visible", timeout: 30000 })
    ]);
  } catch { throw Error("PASSWORD_FORM_NOT_AVAILABLE"); }
  const isPreview = await previewEmail.isVisible();
  report.scope = isPreview ? "preview-password-auth-only" : "staging-app-dashboard";

  if (isPreview) {
    // Older isolated password preview: tests Clerk password completion and isolated account policy,
    // but does NOT claim the real LiveBridge dashboard was opened.
    // A valid form does not guarantee the loaded Clerk SDK exposes the legacy API.
    const sdkApiAvailable = await page.evaluate(() => typeof window.Clerk?.signIn?.password === "function" || typeof window.Clerk?.client?.signIn?.create === "function");
    if (!sdkApiAvailable) throw Error("CLERK_BROWSER_API_UNAVAILABLE");
    await previewEmail.fill(email);
    await page.locator("#pass").fill(password);
    await page.locator("#submit").click();
    try {
      await page.waitForFunction(() => Boolean(document.querySelector("#message")?.textContent?.trim()), null, { timeout: 25000 });
    } catch {
      throw Error("AUTH_REQUEST_TIMED_OUT");
    }
    const status = await page.locator("#message").innerText();
    if (!/Password sign-in successful/i.test(status)) {
      throw Error(await resolveAuthFailure(status));
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
      }, null, { timeout: 30000 });
    } catch {
      const alert = await page.locator("#lb-pw-error").textContent().catch(() => "");
      const cause = await resolveAuthFailure(alert || "");
      throw Error(cause === "AUTH_REJECTED_OR_UNEXPECTED" ? "PASSWORD_DID_NOT_OPEN_DASHBOARD" : cause);
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
    "BROWSER_JAVASCRIPT_ERRORS", "AUTH_REQUEST_TIMED_OUT", "AUTH_REJECTED_OR_UNEXPECTED",
    "PREVIEW_PAGE_NOT_REACHABLE", "PASSWORD_FORM_NOT_AVAILABLE",
    "CLERK_BROWSER_API_UNAVAILABLE", "CLERK_SIGN_IN_NOT_SUBMITTED",
    "CLERK_SIGN_IN_NO_RESPONSE", "CLERK_SIGN_IN_NETWORK_FAILURE",
    "CLERK_SIGN_IN_RESPONDED_BUT_UI_FAILED",
    "CLERK_PASSWORD_INCORRECT", "CLERK_PASSWORD_OR_IDENTIFIER_INCORRECT",
    "CLERK_IDENTIFIER_NOT_FOUND", "CLERK_PASSWORD_VALIDATION_FAILED",
    "CLERK_PASSWORD_STRATEGY_UNAVAILABLE", "CLERK_RATE_LIMITED",
    "CLERK_AUTH_DENIED", "CLERK_AUTH_VALIDATION_FAILED", "PREVIEW_POLICY_API_REJECTED"
  ];
  report.reason = allowed.includes(error.message) ? error.message : "STAGING_BROWSER_TEST_FAILED";
  save();
  console.error("FAIL: " + report.reason);
  process.exitCode = 1;
} finally {
  await browser.close();
}
