import test from "node:test";
import assert from "node:assert/strict";
import { runBrowserProject } from "../diagnostics/browser-runner.mjs";
import { validateProject } from "../diagnostics/runner.mjs";

function mockChromium({ error = null } = {}) {
  const pageHandlers = {};
  const page = {
    on(name, fn) { pageHandlers[name] = fn; },
    route: async () => {},
    goto: async () => { if (error) pageHandlers.pageerror(new Error(error)); return {status: () => 200}; },
    locator: () => ({ first() {return this;}, waitFor: async () => {}, click: async () => {} }),
    waitForTimeout: async () => {}
  };
  const context = {newPage: async () => page, close: async () => {}};
  return {launch: async () => ({newContext: async () => context, close: async () => {}})};
}
const project = {id: "command-center", environment: "production",
  allowedHosts: ["northstarventures.ca"],
  tests: [{id:"admin-opens", group:"regression", type:"browser-page",
    url:"https://northstarventures.ca/admin", expectedSelector:"body"}]
};
test("browser smoke test selects and reports a project in isolation", async () => {
  const result = await runBrowserProject(project, {chromium: mockChromium()});
  assert.equal(result.status, "passed");
  assert.equal(result.tests[0].id, "admin-opens");
  assert.equal(result.projectId, "command-center");
});
test("browser JavaScript errors fail diagnostics without revealing URLs or tokens", async () => {
  const result = await runBrowserProject(project, {
    chromium: mockChromium({error: "Unhandled https://example.test/path?token=secret bearer=SECRET"})
  });
  assert.equal(result.status, "failed");
  assert.doesNotMatch(JSON.stringify(result), /token=secret|bearer=SECRET/);
});
test("production browser clicking cannot be approved", () => {
  assert.throws(() => validateProject({...project, tests: [{
    ...project.tests[0], type:"browser-click", selector:"button",
    safeInteraction:true
  }]}));
});
test("unknown selector input is rejected", () => {
  assert.throws(() => validateProject({...project, tests: [{
    ...project.tests[0], expectedSelector:""
  }]}));
});
test("no configured browser tests gives not-run", async () => {
  const result = await runBrowserProject({...project, tests: []}, {chromium: mockChromium()});
  assert.equal(result.status, "not-run");
});
