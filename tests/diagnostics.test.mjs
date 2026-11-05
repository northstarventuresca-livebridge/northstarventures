import test from "node:test";
import assert from "node:assert/strict";
import { chooseTests, runProject, validateProject } from "../diagnostics/runner.mjs";
const project = {
  id: "test-project", allowedHosts: ["example.org"],
  tests: [
    { id: "specific", group: "targeted", type: "http-get", url: "https://example.org/feature" },
    { id: "navigation", group: "regression", type: "http-get", url: "https://example.org/" },
    { id: "full-audit", group: "full", type: "http-get", url: "https://example.org/audit" }
  ]
};
test("every change runs targeted and regression, not full", () => {
  assert.deepEqual(chooseTests(project).map(t => t.id), ["specific","navigation"]);
  assert.equal(chooseTests(project, "full").length, 3);
});
test("separate projects retain independent identifiers", async () => {
  const fetchImpl = async () => ({ status: 200 });
  const first = await runProject(project, { fetchImpl });
  const second = await runProject({ ...project, id: "another-project" }, { fetchImpl });
  assert.equal(first.projectId, "test-project");
  assert.equal(second.projectId, "another-project");
  assert.notEqual(first.runId, second.runId);
});
test("HTTP failure blocks a passing report", async () => {
  const report = await runProject(project, { fetchImpl: async () => ({status: 503}) });
  assert.equal(report.status, "failed");
  assert.equal(report.tests.length, 2);
  assert.equal(report.tests[0].detail, "HTTP 503");
});
test("network errors are recorded without leaking exception messages", async () => {
  const report = await runProject(project, { fetchImpl: async () => {throw Error("secret-token=ABC");} });
  assert.equal(report.status, "failed");
  assert.equal(report.tests[0].detail, "Request failed");
  assert.doesNotMatch(JSON.stringify(report), /secret-token/);
});
test("disallow unapproved hosts, HTTP, duplicates, login tokens and unsupported operations", () => {
  for (const url of ["http://example.org/", "https://evil.org/", "https://user:pass@example.org/",
    "https://example.org/?token=abc", "https://example.org:444/"]) {
    assert.throws(() => validateProject({ ...project, tests: [{ ...project.tests[0], url }] }));
  }
  assert.throws(() => validateProject({ ...project, tests: [project.tests[0], project.tests[0]] }));
  assert.throws(() => validateProject({ ...project, tests: [{...project.tests[0], type:"post"}] }));
});
test("projects without hardware tests are clearly not run", async () => {
  const report = await runProject({ id: "x32-ai-engineer", allowedHosts: [], tests: [] });
  assert.equal(report.status, "not-run");
});
