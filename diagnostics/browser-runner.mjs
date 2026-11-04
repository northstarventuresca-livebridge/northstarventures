import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { chooseTests, validateProject } from "./runner.mjs";

const TIMEOUT = 15000;
const sanitize = (text) => String(text ?? "").replace(/https?:\/\/[^\s"'<>]+/g, value => {
  try { const url = new URL(value); return url.origin + url.pathname; }
  catch { return "[URL redacted]"; }
}).replace(/(bearer|token|password|secret|cookie|authorization)[=: ]+[^\s,;]+/gi, "$1=[redacted]").slice(0, 350);

function visibleAddress(raw) {
  try { const u = new URL(raw); return u.origin + u.pathname; }
  catch { return "[invalid URL]"; }
}
function isAllowed(urlString, project) {
  try {
    const u = new URL(urlString);
    return u.protocol === "https:" && project.allowedHosts.includes(u.hostname) && !u.username && !u.password;
  } catch { return false; }
}
function setupRouteProtection(page, project) {
  return page.route("**/*", async route => {
    const request = route.request(), url = request.url();
    if (request.method() !== "GET" && request.method() !== "HEAD") {
      return route.abort("blockedbyclient");
    }
    // Browser navigation MUST stay on approved project hosts; no redirects
    // into unrelated sites. Read-only CDN assets may be fetched over HTTPS.
    if (request.isNavigationRequest() && !isAllowed(url, project)) return route.abort("blockedbyclient");
    if (!url.startsWith("https:") && !url.startsWith("data:") && !url.startsWith("blob:")) return route.abort("blockedbyclient");
    return route.continue();
  });
}
export async function runBrowserProject(project, {
  level = "change", chromium, now = () => new Date().toISOString()
} = {}) {
  validateProject(project);
  if (!chromium) throw new Error("Chromium driver is required");
  const tests = chooseTests(project, level).filter(t => t.type.startsWith("browser-"));
  const report = { schema: 1, kind: "browser", runId: randomUUID(),
    projectId: project.id, level, startedAt: now(), status: "not-run", tests: [] };
  if (!tests.length) { report.finishedAt = now(); return report; }
  const browser = await chromium.launch({ headless: true });
  try {
    for (const spec of tests) {
      const time = Date.now(), issues = [];
      const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
      const page = await context.newPage();
      page.on("pageerror", error => issues.push("JavaScript: " + sanitize(error.message)));
      page.on("console", message => {
        if (message.type() === "error") issues.push("Console: " + sanitize(message.text()));
      });
      page.on("response", response => {
        if (response.status() >= 500) issues.push("HTTP " + response.status() + " " + visibleAddress(response.url()));
      });
      await setupRouteProtection(page, project);
      let status = "passed", detail = "Page rendered";
      try {
        const response = await page.goto(spec.url, {waitUntil: "domcontentloaded", timeout: TIMEOUT});
        if (!response || response.status() >= 400) throw Error("Navigation HTTP " + (response?.status() ?? "no response"));
        await page.locator(spec.expectedSelector ?? "body").first().waitFor({state: "visible", timeout: 8000});
        if (spec.type === "browser-click") {
          // Only explicitly approved, non-mutating controls on test environments.
          if (project.environment !== "test" || spec.safeInteraction !== true)
            throw Error("Click tests require an explicitly approved test environment");
          await page.locator(spec.selector).click({timeout: 5000});
          if (spec.resultSelector)
            await page.locator(spec.resultSelector).first().waitFor({state: "visible", timeout: 5000});
        }
        await page.waitForTimeout(500);
        if (issues.length) { status = "failed"; detail = issues.slice(0, 8).join(" | "); }
      } catch (error) {
        status = "failed";
        detail = sanitize(error.message).split("\n")[0];
        if (issues.length) detail += " | " + issues.slice(0, 4).join(" | ");
      } finally { await context.close(); }
      report.tests.push({id: spec.id, group: spec.group, status, detail,
        durationMs: Date.now() - time});
    }
  } finally { await browser.close(); }
  report.status = report.tests.every(t => t.status === "passed") ? "passed" : "failed";
  report.finishedAt = now();
  return report;
}
async function main() {
  const args = process.argv.slice(2);
  const arg = key => args[args.indexOf(key) + 1];
  const id = arg("--project"), level = args.includes("--level") ? arg("--level") : "change";
  if (!id || !/^[a-z0-9][a-z0-9-]{1,48}$/.test(id)) throw Error("Unknown project");
  const projects = JSON.parse(await readFile(new URL("./projects.json", import.meta.url), "utf8"));
  const project = projects.find(p => p.id === id);
  if (!project) throw Error("Unknown project");
  const { chromium } = await import("playwright");
  const report = await runBrowserProject(project, {level, chromium});
  const outputDir = resolve("diagnostics-results", id);
  await mkdir(outputDir, {recursive: true});
  await writeFile(resolve(outputDir, report.runId + "-browser.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({project: id, level, status: report.status, tests: report.tests.length}));
  if (report.status === "failed") process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch(e => { console.error(sanitize(e.message)); process.exitCode = 1; });
}
