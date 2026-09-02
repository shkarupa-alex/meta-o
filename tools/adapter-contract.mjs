#!/usr/bin/env node

/**
 * Validate and exercise the find-reuse adapter data without a shell.
 *
 * Protects §A-REUSE-01.
 */

import { readFileSync } from "node:fs";
import { request } from "node:http";
import { request as secureRequest } from "node:https";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ALLOWED_CAPABILITIES = new Set([
  "semantic_search",
  "name_search",
  "exact_lookup",
  "downloads",
  "releases",
  "maintenance",
  "reverse_dependencies",
  "security",
]);
const ALLOWED_ERRORS = new Set([
  "tool_missing",
  "auth_missing",
  "rate_limited",
  "source_unavailable",
  "malformed",
  "adapter_unsupported",
]);
const ALLOWED_TRANSPORTS = new Set(["argv", "http_get", "http_post"]);
const REQUIRED_IDS = new Set([
  "local-git",
  "github",
  "gitlab",
  "npm",
  "pypi",
  "crates-io",
  "go-modules",
  "maven-central",
  "nuget",
  "rubygems",
  "packagist",
  "osv",
]);

const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const DEFAULT_DESCRIPTOR_PATH = resolve(HERE, "src/skills/find-reuse/references/adapters.json");

function nonemptyStrings(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item)
  );
}

/** §A-REUSE-01 loads the normative descriptors from a caller-selected path. */
export function loadDescriptors(path = DEFAULT_DESCRIPTOR_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** §A-REUSE-01 returns every structural contract error without mutating descriptors. */
export function validateDescriptors(descriptors) {
  const errors = [];
  if (!Array.isArray(descriptors)) return ["descriptor root must be an array"];
  const ids = new Set();
  for (const descriptor of descriptors) {
    const label = descriptor?.id ?? "<missing-id>";
    if (typeof descriptor?.id !== "string" || !descriptor.id) errors.push(`${label}: invalid id`);
    else if (ids.has(descriptor.id)) errors.push(`${label}: duplicate id`);
    else ids.add(descriptor.id);
    validateDescriptor(descriptor, label, errors);
  }
  for (const id of REQUIRED_IDS) if (!ids.has(id)) errors.push(`missing required adapter ${id}`);
  return errors;
}

function validateDescriptor(descriptor, label, errors) {
  validateDescriptorArrays(descriptor, label, errors);
  validateInstallHelp(descriptor, label, errors);
  validateDescriptorMetadata(descriptor, label, errors);
  const operations = descriptor?.operations;
  if (!Array.isArray(operations) || operations.length === 0) {
    errors.push(`${label}: operations must be non-empty`);
    return;
  }
  operations.forEach((operation, index) =>
    validateOperation(operation, `${label}[${index}]`, errors),
  );
  const covered = new Set(
    operations.flatMap((operation) => [operation.capability, ...(operation.provides ?? [])]),
  );
  for (const capability of descriptor.capabilities ?? []) {
    if (!covered.has(capability)) {
      errors.push(`${label}: declared capability ${capability} has no exact operation`);
    }
  }
}

function validateDescriptorArrays(descriptor, label, errors) {
  const fields = [
    "ecosystems",
    "capabilities",
    "required_tools",
    "version_probe",
    "capability_probe",
  ];
  for (const field of fields) {
    if (!nonemptyStrings(descriptor?.[field]))
      errors.push(`${label}: ${field} must be non-empty strings`);
  }
  for (const capability of descriptor?.capabilities ?? []) {
    if (!ALLOWED_CAPABILITIES.has(capability))
      errors.push(`${label}: unknown capability ${capability}`);
  }
}

function validateInstallHelp(descriptor, label, errors) {
  for (const os of ["macos", "debian", "windows", "other"]) {
    if (typeof descriptor?.install_help?.[os] !== "string" || !descriptor.install_help[os]) {
      errors.push(`${label}: missing install_help.${os}`);
    }
  }
}

function validateDescriptorMetadata(descriptor, label, errors) {
  if (!/^(?:https:\/\/|local:\/\/)/u.test(descriptor?.base_url ?? "")) {
    errors.push(`${label}: base_url must be production https or local`);
  }
  if (!new Set(["never", "private_only", "always"]).has(descriptor?.auth_required)) {
    errors.push(`${label}: invalid auth_required`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(descriptor?.last_verified ?? "")) {
    errors.push(`${label}: invalid last_verified`);
  }
}

function validateOperation(operation, label, errors) {
  if (!ALLOWED_CAPABILITIES.has(operation?.capability)) errors.push(`${label}: invalid capability`);
  if (
    operation?.provides !== undefined &&
    (!nonemptyStrings(operation.provides) ||
      operation.provides.some((capability) => !ALLOWED_CAPABILITIES.has(capability)))
  ) {
    errors.push(`${label}: provides must contain known capabilities`);
  }
  if (!ALLOWED_TRANSPORTS.has(operation?.transport)) errors.push(`${label}: invalid transport`);
  if (!nonemptyStrings(operation?.argv_or_url))
    errors.push(`${label}: argv_or_url must be non-empty strings`);
  if (!new Set(["json", "json_lines", "text"]).has(operation?.output))
    errors.push(`${label}: invalid output`);
  validateOperationSuccess(operation, label, errors);
  validateOperationErrors(operation, label, errors);
}

function validateOperationSuccess(operation, label, errors) {
  const success = operation.success ?? {};
  if (operation.transport === "argv" && !nonemptyNumbers(success.exit_codes)) {
    errors.push(`${label}: argv success needs exit_codes`);
  }
  if (operation.transport?.startsWith("http_") && !nonemptyNumbers(success.http_status)) {
    errors.push(`${label}: HTTP success needs http_status`);
  }
}

function validateOperationErrors(operation, label, errors) {
  if (!operation?.errors || Object.keys(operation.errors).length === 0)
    errors.push(`${label}: errors required`);
  for (const value of Object.values(operation?.errors ?? {})) {
    if (!ALLOWED_ERRORS.has(value)) errors.push(`${label}: invalid typed error ${value}`);
  }
}

function nonemptyNumbers(value) {
  return Array.isArray(value) && value.length > 0 && value.every(Number.isInteger);
}

/** §A-REUSE-01 expands placeholders inside separate tokens and URL-encodes only named encoded values. */
export function renderParts(parts, values) {
  const renderedValues = {
    ...values,
    encoded_query: encodeURIComponent(values.query ?? ""),
    encoded_package: encodeURIComponent(values.package ?? ""),
    package_path: String(values.package ?? "")
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/"),
  };
  return parts.map((part) =>
    part.replaceAll(/\{([a-z_]+)\}/gu, (match, name) => {
      if (!Object.hasOwn(renderedValues, name)) throw new Error(`missing placeholder ${match}`);
      return String(renderedValues[name]);
    }),
  );
}

/** §A-REUSE-01 executes one documented argv operation with shell expansion disabled. */
export function executeArgv(operation, values, options = {}) {
  if (operation.transport !== "argv") throw new Error("operation is not argv");
  const [command, ...args] = renderParts(operation.argv_or_url, values);
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    shell: false,
  });
}

/** §A-REUSE-01 executes one HTTP template against production or an explicit fixture base URL. */
export function executeHttp(operation, values, options = {}) {
  if (!operation.transport.startsWith("http_")) throw new Error("operation is not HTTP");
  const [rendered] = renderParts(operation.argv_or_url, values);
  const target = new URL(rendered, options.baseUrl);
  const transport = target.protocol === "https:" ? secureRequest : request;
  const body = operation.transport === "http_post" ? JSON.stringify(options.body ?? {}) : undefined;
  return new Promise((resolveRequest, reject) => {
    const outgoing = transport(
      target,
      {
        method: operation.transport === "http_post" ? "POST" : "GET",
        headers: {
          "user-agent": "meta-o-find-reuse-live-check/1",
          accept: operation.output === "json" ? "application/json" : "text/plain, */*",
          ...(body
            ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
            : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (operation.output === "json") {
            try {
              JSON.parse(text);
            } catch {
              resolveRequest({ status: response.statusCode, error: "malformed", body: text });
              return;
            }
          }
          resolveRequest({ status: response.statusCode, body: text });
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.setTimeout(options.timeoutMs ?? 15_000, () => outgoing.destroy(new Error("timeout")));
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

function usage() {
  return "usage: adapter-contract.mjs [--validate] [descriptor-path]";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] && args[0] !== "--validate") {
    console.error(usage());
    process.exitCode = 2;
  } else {
    const descriptors = loadDescriptors(args[1]);
    const errors = validateDescriptors(descriptors);
    if (errors.length > 0) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else console.log(`adapter descriptors ok: ${descriptors.length}`);
  }
}
