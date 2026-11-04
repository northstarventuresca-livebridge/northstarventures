import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

// This runner never authenticates, submits forms, writes app data or changes a mixer.
// Adapter tests for private workflows will be added in their respective repositories.
export function chooseTests(project, level = "change") {
  if (!["change", "full"].includes(level)) throw new Error("Invalid test level");
  if (!project || !Array.isArray(project.tests)) throw new Error("Invalid project configuration");
  return project.tests.filter(test => test.enabled !== false &&
    (level === "full" || test.group === "targeted" || test.group === "regression"));
}

export function validateProject(project) {
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(project?.id ?? "")) throw new Error("Invalid project ID");
  if (!Array.isArray(project.tests)) throw new Error("Missing tests");
  const ids = new Set();
  for (const test of project.tests) {
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(test.id) || ids.has(test.id)) throw new Error("Duplicate or invalid test ID");
    ids.add(test.id);
    if (!["targeted", "regression", "full"].includes(test.group)) throw new Error("Invalid test group");
    if (test.type !== "http-get") throw new Error("Unsupported test type");
    // Explicit HTTPS allowlist prevents accidental probes into internal resources.
    const url = new URL(test.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash ||
        !project.allowedHosts.includes(url.hostname)) throw new Error("Unapproved test URL");
  }
  return project;
}

export async function runProject(project, { level = "change", fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  validateProject(project);
  const report = { schema: 1, runId: randomUUID(), projectId: project.id, level,
    startedAt: now(), tests: [], status: "passed" };
  for (const test of chooseTests(project, level)) {
    const started = Date.now();
    let status = "passed", detail = "HTTP 200-399";
    try {
      const response = await fetchImpl(test.url, {
        method: "GET", redirect: "manual", signal: AbortSignal.timeout(10000),
        headers: { "user-agent": "NorthStar-ReadOnlyDiagnostics/1.0" }
      });
      // Redirects are not followed, so no accidental off-allowlist requests.
      if (response.status >= 400 || response.status < 200) {
        status = "failed"; detail = "HTTP " + response.status;
      } else detail = "HTTP " + response.status;
    } catch (error) {
      status = "failed";
      detail = error?.name === "TimeoutError" ? "Request timed out" : "Request failed";
    }
    report.tests.push({ id: test.id, group: test.group, status, detail,
      durationMs: Date.now() - started });
    if (status === "failed") report.status = "failed";
  }
  if (!report.tests.length) report.status = "not-run";
  report.finishedAt = now();
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = name => args[args.indexOf(name) + 1];
  const id = arg("--project"), level = args.includes("--level") ? arg("--level") : "change";
  if (!id || !/^[a-z0-9][a-z0-9-]{1,48}$/.test(id)) throw new Error("Use --project <known-project-id>");
  const projects = JSON.parse(await readFile(new URL("./projects.json", import.meta.url), "utf8"));
  const project = projects.find(item => item.id === id);
  if (!project) throw new Error("Unknown project");
  const report = await runProject(project, { level });
  const outputDir = resolve("diagnostics-results", id);
  await mkdir(outputDir, { recursive: true });
  const output = resolve(outputDir, report.runId + ".json");
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ project: id, level, status: report.status, tests: report.tests.length, output }));
  if (report.status !== "passed") process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
