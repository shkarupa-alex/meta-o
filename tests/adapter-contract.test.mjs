/**
 * Execute find-reuse adapter templates against deterministic local doubles.
 *
 * Protects §A-REUSE-01.
 */

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, delimiter, join } from "node:path";
import { after, test } from "node:test";

import {
  executeArgv,
  executeHttp,
  loadDescriptors,
  renderParts,
  validateDescriptors,
} from "../tools/adapter-contract.mjs";

const descriptors = loadDescriptors();
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

const VALUES = {
  query: "parser; touch SHOULD_NOT_EXIST",
  package: "vendor/package",
  escaped_module: "github.com/example/module",
  search_query_service: "/nuget-search",
  lockfile: "fixture.lock",
};

test("all required adapters satisfy the executable descriptor schema", () => {
  assert.deepEqual(validateDescriptors(descriptors), []);
  assert.equal(new Set(descriptors.map(({ id }) => id)).size, descriptors.length);
});

test("argv templates preserve hostile input as one literal argument", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-adapter-argv-"));
  roots.push(root);
  const commands = new Set(
    descriptors.flatMap(({ operations }) =>
      operations
        .filter(({ transport }) => transport === "argv")
        .map(({ argv_or_url }) => argv_or_url[0]),
    ),
  );
  for (const command of commands) {
    const executable = join(root, basename(command));
    writeFileSync(executable, "#!/bin/sh\nprintf '%s\\n' \"$@\"\n");
    chmodSync(executable, 0o755);
  }
  const environment = { ...process.env, PATH: `${root}${delimiter}${process.env.PATH}` };
  for (const descriptor of descriptors) {
    for (const operation of descriptor.operations.filter(({ transport }) => transport === "argv")) {
      const result = executeArgv(operation, VALUES, { cwd: root, env: environment });
      assert.equal(result.status, 0, descriptor.id);
      if (operation.argv_or_url.includes("{query}"))
        assert.match(result.stdout, /^parser; touch SHOULD_NOT_EXIST$/mu);
    }
  }
  assert.throws(() => renderParts(["{unknown}"], VALUES), /missing placeholder/);
});

test("HTTP templates use encoded paths, expected methods and parseable local responses", async () => {
  const observed = [];
  const server = createServer((request, response) => {
    observed.push({ method: request.method, url: request.url });
    request.resume();
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
    });
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();
  try {
    for (const descriptor of descriptors) {
      for (const operation of descriptor.operations.filter(({ transport }) =>
        transport.startsWith("http_"),
      )) {
        const result = await executeHttp(operation, VALUES, {
          baseUrl: `http://127.0.0.1:${port}`,
          body: { package: { name: "fixture", ecosystem: "npm" } },
        });
        assert.equal(result.status, 200, descriptor.id);
        assert.equal(result.error, undefined, descriptor.id);
      }
    }
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
  assert.ok(observed.some(({ method }) => method === "POST"));
  assert.ok(observed.some(({ url }) => url.includes("parser%3B%20touch%20SHOULD_NOT_EXIST")));
});
