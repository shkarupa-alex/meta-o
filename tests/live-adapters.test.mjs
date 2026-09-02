import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import { loadDescriptors } from "../tools/adapter-contract.mjs";
import { resolveBaseUrl, verifyHttp } from "../tools/live-adapters.mjs";

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

test("named fixture environment overrides only its descriptor base URL", () => {
  const descriptor = loadDescriptors().find(({ id }) => id === "github");
  assert.equal(
    resolveBaseUrl(descriptor, { [descriptor.test_base_url_env]: "http://127.0.0.1:4321" }),
    "http://127.0.0.1:4321",
  );
  assert.equal(resolveBaseUrl(descriptor, {}), descriptor.base_url);
});

test("live HTTP operations use the named fixture override", async () => {
  const descriptor = loadDescriptors().find(({ id }) => id === "npm");
  const observed = [];
  await withServer(
    (request, response) => {
      observed.push(request.url);
      request.resume();
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"ok":true}');
      });
    },
    async (baseUrl) => {
      const evidence = [];
      const failures = await verifyHttp(descriptor, evidence, {
        [descriptor.test_base_url_env]: baseUrl,
      });
      assert.deepEqual(failures, []);
      assert.ok(evidence.length > 0);
    },
  );
  assert.ok(observed.length > 0);
});

test("NuGet bootstrap failure becomes typed sanitized evidence", async () => {
  const descriptor = loadDescriptors().find(({ id }) => id === "nuget");
  await withServer(
    (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("not-json\nSECRET-SECOND-LINE");
    },
    async (baseUrl) => {
      const evidence = [];
      const failures = await verifyHttp(descriptor, evidence, {
        [descriptor.test_base_url_env]: baseUrl,
      });
      assert.deepEqual(failures, ["nuget: /v3/index.json => malformed"]);
      assert.equal(evidence.length, 1);
      assert.equal(evidence[0].status, "malformed");
      assert.doesNotMatch(evidence[0].result, /SECRET-SECOND-LINE/u);
    },
  );
});
