#!/usr/bin/env node

/**
 * Produce sanitized live evidence for find-reuse production adapter descriptors.
 *
 * Protects §A-REUSE-01.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  executeArgv,
  executeHttp,
  loadDescriptors,
  validateDescriptors,
} from "./adapter-contract.mjs";

const SAMPLE = {
  github: { query: "json parser", package: "cli/cli" },
  gitlab: { query: "json parser", package: "gitlab-org/cli" },
  npm: { query: "json parser", package: "lodash" },
  pypi: { query: "http client", package: "requests" },
  "crates-io": { query: "json parser", package: "serde" },
  "go-modules": {
    query: "http router",
    package: "github.com/stretchr/testify",
    escaped_module: "github.com/stretchr/testify",
  },
  "maven-central": {
    query: "g:org.junit.jupiter",
    package: "org.junit.jupiter:junit-jupiter",
  },
  nuget: { query: "newtonsoft json", package: "Newtonsoft.Json" },
  rubygems: { query: "http router", package: "rack" },
  packagist: { query: "logger", package: "monolog/monolog" },
  osv: { query: "lodash", package: "lodash", lockfile: "package-lock.json" },
};

function sanitized(value) {
  return String(value ?? "")
    .trim()
    .split("\n")[0]
    .slice(0, 200);
}

function probe(descriptor, argv, kind) {
  const [command, ...args] = argv;
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    timeout: 15_000,
  });
  if (result.error?.code === "ENOENT") {
    return { adapter: descriptor.id, kind, command: argv, status: "tool_missing" };
  }
  return {
    adapter: descriptor.id,
    kind,
    command: argv,
    status: result.status === 0 ? "ok" : "adapter_unsupported",
    result: sanitized(result.stdout || result.stderr),
  };
}

/** §A-REUSE-01 turns an absent declared executable into blocking typed evidence. */
export function verifyRequiredTool(descriptor, tool) {
  const result = spawnSync(tool, ["--version"], {
    encoding: "utf8",
    shell: false,
    timeout: 15_000,
  });
  return {
    adapter: descriptor.id,
    kind: "required_tool",
    command: [tool, "--version"],
    status: result.error
      ? result.error.code === "ENOENT"
        ? "tool_missing"
        : "adapter_unsupported"
      : "ok",
  };
}

/** §A-REUSE-01 executes every declared argv operation so live coverage cannot stop at help probes. */
export function verifyArgv(descriptor, evidence, environment = process.env) {
  const values = SAMPLE[descriptor.id];
  if (!values) return [];
  const failures = [];
  for (const operation of descriptor.operations.filter(({ transport }) => transport === "argv")) {
    const result = executeArgv(operation, values, { env: environment, cwd: process.cwd() });
    const status =
      result.error?.code === "ENOENT"
        ? "tool_missing"
        : operation.success.exit_codes.includes(result.status)
          ? "ok"
          : (operation.errors?.[String(result.status)] ?? "adapter_unsupported");
    evidence.push({
      adapter: descriptor.id,
      kind: "argv",
      command: operation.argv_or_url,
      status,
      result: sanitized(result.stdout || result.stderr || result.error?.message),
    });
    if (status !== "ok") {
      failures.push(`${descriptor.id}: ${operation.argv_or_url.join(" ")} => ${status}`);
    }
  }
  return failures;
}

async function nugetValues(values, baseUrl) {
  const response = await fetch(new URL("/v3/index.json", baseUrl), {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`NuGet index returned HTTP ${response.status}`);
  const index = await response.json();
  const resource = index.resources.find(({ "@type": type }) =>
    String(type).startsWith("SearchQueryService"),
  );
  if (!resource?.["@id"]) throw new Error("NuGet index has no SearchQueryService");
  return { ...values, search_query_service: resource["@id"] };
}

/** §A-REUSE-01 resolves production or the descriptor's explicitly named fixture override. */
export function resolveBaseUrl(descriptor, environment = process.env) {
  const override = descriptor.test_base_url_env
    ? environment[descriptor.test_base_url_env]
    : undefined;
  return override?.trim() || descriptor.base_url;
}

function typedHttpFailure(error) {
  return error instanceof SyntaxError ? "malformed" : "source_unavailable";
}

/** §A-REUSE-01 exercises one descriptor and appends only sanitized HTTP evidence. */
export async function verifyHttp(descriptor, evidence, environment = process.env) {
  let values = SAMPLE[descriptor.id];
  if (!values) return [];
  const failures = [];
  const baseUrl = resolveBaseUrl(descriptor, environment);
  if (descriptor.id === "nuget") {
    try {
      values = await nugetValues(values, baseUrl);
    } catch (error) {
      const status = typedHttpFailure(error);
      evidence.push({
        adapter: descriptor.id,
        kind: "http_get",
        command: ["/v3/index.json"],
        status,
        result: sanitized(error.message),
      });
      failures.push(`${descriptor.id}: /v3/index.json => ${status}`);
      return failures;
    }
  }
  const operations = descriptor.operations.filter(({ transport }) => transport.startsWith("http_"));
  for (const operation of operations) {
    let result;
    try {
      result = await executeHttp(operation, values, {
        baseUrl,
        body: { package: { name: "lodash", ecosystem: "npm" } },
        timeoutMs: 30_000,
      });
    } catch (error) {
      const status = "source_unavailable";
      evidence.push({
        adapter: descriptor.id,
        kind: operation.transport,
        command: operation.argv_or_url,
        status,
        result: sanitized(error.message),
      });
      failures.push(`${descriptor.id}: ${operation.argv_or_url.join(" ")} => ${status}`);
      continue;
    }
    const expected = operation.success.http_status.includes(result.status);
    const status = expected && !result.error ? "ok" : (result.error ?? "source_unavailable");
    evidence.push({
      adapter: descriptor.id,
      kind: operation.transport,
      command: operation.argv_or_url,
      status,
      http_status: result.status,
    });
    if (status !== "ok")
      failures.push(`${descriptor.id}: ${operation.argv_or_url.join(" ")} => ${status}`);
  }
  return failures;
}

/** §A-REUSE-01 verifies installed probes and public HTTP operations, returning sanitized evidence. */
export async function verifyLive(descriptors = loadDescriptors()) {
  const failures = validateDescriptors(descriptors);
  const evidence = [];
  for (const descriptor of descriptors) {
    for (const tool of descriptor.required_tools) {
      const item = verifyRequiredTool(descriptor, tool);
      evidence.push(item);
      if (item.status !== "ok") failures.push(`${descriptor.id}: required tool ${tool} missing`);
    }
    const probes = [
      ["version_probe", descriptor.version_probe],
      ["capability_probe", descriptor.capability_probe],
      ...(descriptor.auth_required === "always" && descriptor.auth_probe
        ? [["auth_probe", descriptor.auth_probe]]
        : []),
    ];
    for (const [kind, argv] of probes) {
      const item = probe(descriptor, argv, kind);
      evidence.push(item);
      if (item.status !== "ok") failures.push(`${descriptor.id}: ${kind} => ${item.status}`);
    }
    failures.push(...verifyArgv(descriptor, evidence));
    failures.push(...(await verifyHttp(descriptor, evidence)));
  }
  return {
    contract: "find-reuse.live-adapters.v1",
    timestamp: new Date().toISOString(),
    evidence,
    failures,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await verifyLive();
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length > 0) process.exitCode = 1;
}
