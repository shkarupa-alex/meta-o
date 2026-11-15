/**
 * The owner's proxy reaches agent environments and nothing else.
 *
 * meta-o runs the same managed Makefile block mo-setup ships, so its own QC,
 * tests and smoke go without a proxy and only `mo-live-adapters` gets it back.
 * The live mechanism is exercised by `make mo-smoke`; this test keeps the two
 * copies equal and the agent targets free of prerequisites, because a
 * target-specific export is inherited by every prerequisite of its target.
 *
 * Protects §A-POSTURE-01.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ASSET = join(ROOT, "src", "skills", "mo-setup", "assets", "make", "agent-proxy.mk");
const PROXY_VARS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
];

/** The block between the markers, without comments: the code both copies must share. */
function blockCode(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^# >>> meta-o: /u.test(line));
  const end = lines.findIndex((line) => /^# <<< meta-o: /u.test(line));
  assert.ok(start >= 0 && end > start, "managed block markers are missing");
  return lines.slice(start + 1, end).filter((line) => line.trim() !== "" && !line.startsWith("#"));
}

function withoutProxies() {
  const environment = { ...process.env };
  for (const name of PROXY_VARS) delete environment[name];
  return environment;
}

test("meta-o's Makefile runs the shipped managed proxy block", () => {
  const shipped = blockCode(readFileSync(ASSET, "utf8"));
  const own = blockCode(readFileSync(join(ROOT, "Makefile"), "utf8"));
  const targetsLine = /^MO_AGENT_ENV_TARGETS := /u;
  assert.deepEqual(
    own.filter((line) => !targetsLine.test(line)),
    shipped.filter((line) => !targetsLine.test(line)),
  );
  assert.ok(shipped.includes("MO_AGENT_ENV_TARGETS := <agent-env-targets>"));
  assert.ok(own.includes("MO_AGENT_ENV_TARGETS := mo-live-adapters"));
  assert.ok(shipped.includes(`MO_PROXY_VARS := ${PROXY_VARS.join(" ")}`));
  assert.ok(shipped.includes("unexport $(MO_PROXY_VARS)"));
});

test("agent-environment targets have no prerequisites and QC is not one of them", () => {
  const database = spawnSync("make", ["--no-print-directory", "-pq", "mo-live-adapters"], {
    cwd: ROOT,
    encoding: "utf8",
    env: withoutProxies(),
  });
  const variable = database.stdout.match(/^MO_AGENT_ENV_TARGETS := (.*)$/mu);
  assert.ok(variable, "the make database does not show MO_AGENT_ENV_TARGETS");
  const targets = variable[1].trim().split(/\s+/u);
  assert.deepEqual(targets, ["mo-live-adapters"]);
  const stages = database.stdout
    .match(/^MO_QC_STAGES = (.*)$/mu)[1]
    .trim()
    .split(/\s+/u);
  for (const target of targets) {
    assert.ok(!["mo-qc", "mo-test", "mo-smoke", ...stages].includes(target), target);
    // Target-specific variable lines also start with the target name; the rule
    // line is the one without an assignment.
    const rules = database.stdout
      .split("\n")
      .filter((line) => line.startsWith(`${target}:`) && !line.includes("="));
    assert.deepEqual(rules, [`${target}:`]);
  }
});

test("project-setup tells the consumer to apply the block and how to bypass a proxy once", () => {
  const contract = readFileSync(join(ROOT, "shared", "references", "project-setup.md"), "utf8");
  const prose = contract.replace(/\s+/gu, " ");
  assert.match(prose, /`assets\/make\/agent-proxy\.mk`/u);
  assert.match(prose, /no QC or test prerequisites/u);
  const recipe = `env ${PROXY_VARS.map((name) => `-u ${name}`).join(" ")} <cmd>`;
  assert.ok(prose.includes(recipe), recipe);
  const papercut = readFileSync(join(ROOT, "docs", "papercut.md"), "utf8").replace(/\s+/gu, " ");
  assert.ok(papercut.includes(`env ${PROXY_VARS.map((name) => `-u ${name}`).join(" ")}`));
});
