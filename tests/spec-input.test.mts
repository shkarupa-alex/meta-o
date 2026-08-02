/**
 * §M-TEST-SPEC-INPUT — The three limits §20 puts on a spec fetched over the network.
 *
 * "HTTPS, ≤3 redirects, ≤10 MiB decompressed" was implemented correctly and
 * proven by nothing: a clean-room reading found all three limits present in
 * `src/core/spec-input.mts` and no test that touched any of them. The immutable
 * spec is this workflow's acceptance oracle, so an unbounded fetch is the one
 * input that can rewrite what "done" means.
 *
 * The server here is a real HTTPS server on loopback with a throwaway
 * certificate committed beside this file. No test reaches the internet: a
 * quality gate that needs the network is a gate that gets disabled.
 *
 * Verifies §A-IMMUTABLE-SPEC.
 */

import { strict as assert } from "node:assert";
import { after, test } from "node:test";
import { createServer, type Server } from "node:https";
import type { ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

import { MAX_REDIRECTS, MAX_SPEC_BYTES, fetchHttpsSpec } from "../dist/core/spec-input.mjs";

/** §M-TEST-SPEC-INPUT — The throwaway localhost certificate this suite serves with. */
const TLS = {
  cert: readFileSync(fileURLToPath(new URL("./fixtures/localhost-cert.pem", import.meta.url))),
  key: readFileSync(fileURLToPath(new URL("./fixtures/localhost-key.pem", import.meta.url))),
};

// The fixture certificate is self-signed by design; trusting it for this
// process is what makes a real TLS request testable without a network.
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

/** §M-TEST-SPEC-INPUT — How one request to the fixture server is answered. */
type Handler = (path: string, response: ServerResponse) => void;

/** §M-TEST-SPEC-INPUT — Start a loopback HTTPS server and return its base URL. */
async function serve(handler: Handler): Promise<{ url: string; close(): Promise<void> }> {
  const server: Server = createServer(TLS, (request, response) => {
    handler(request.url ?? "/", response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return {
    url: `https://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

after(() => {
  delete process.env["NODE_TLS_REJECT_UNAUTHORIZED"];
});

test("a spec URL that is not https is refused before any socket is opened", async () => {
  await assert.rejects(
    () => fetchHttpsSpec("http://127.0.0.1:1/spec.md"),
    /spec URL must use https, got http:/,
    "a spec fetched over a channel an attacker can rewrite is not an acceptance oracle",
  );
});

test("a spec URL is followed for three redirects and no further", async () => {
  let served = 0;
  const server = await serve((path, response) => {
    const hop = Number(path.slice(1).split(".")[0]) || 0;
    if (hop >= 10) {
      served += 1;
      response.writeHead(200, { "content-type": "text/markdown" });
      response.end("# arrived\n");
      return;
    }
    response.writeHead(302, { location: `/${hop + 1}.md` });
    response.end();
  });

  try {
    // Exactly the budget: three hops then the document.
    const withinBudget = await serve((path, response) => {
      const hop = Number(path.slice(1).split(".")[0]) || 0;
      if (hop >= MAX_REDIRECTS) {
        response.writeHead(200, { "content-type": "text/markdown" });
        response.end("# arrived\n");
        return;
      }
      response.writeHead(302, { location: `/${hop + 1}.md` });
      response.end();
    });
    try {
      const bytes = await fetchHttpsSpec(`${withinBudget.url}/0.md`);
      assert.equal(bytes.toString("utf8"), "# arrived\n");
    } finally {
      await withinBudget.close();
    }

    await assert.rejects(
      () => fetchHttpsSpec(`${server.url}/0.md`),
      new RegExp(`spec URL exceeded ${MAX_REDIRECTS} redirects`),
      "an unbounded redirect chain is a fetch that never has to arrive anywhere",
    );
    assert.equal(served, 0, "the document past the budget must never be read");
  } finally {
    await server.close();
  }
});

test("a compressed spec is bounded by its decompressed size, not its transfer size", async () => {
  // The limit that matters. A gzip bomb is small on the wire and unbounded in
  // memory, so a cap applied to the response body rather than to the
  // decompressed stream is not a cap at all.
  const bomb = gzipSync(Buffer.alloc(MAX_SPEC_BYTES + 1024, 0x61));
  assert.ok(bomb.length < 64 * 1024, `the fixture must be small on the wire, is ${bomb.length}`);

  const server = await serve((_path, response) => {
    response.writeHead(200, { "content-type": "text/markdown", "content-encoding": "gzip" });
    response.end(bomb);
  });
  try {
    await assert.rejects(
      () => fetchHttpsSpec(`${server.url}/spec.md`),
      new RegExp(`spec exceeds ${MAX_SPEC_BYTES} bytes after decompression`),
    );
  } finally {
    await server.close();
  }
});

test("a spec served inside both limits arrives byte for byte", async () => {
  const body = "# Checkout\n\nThe cart must survive a refresh.\n";
  const server = await serve((_path, response) => {
    response.writeHead(200, { "content-type": "text/markdown", "content-encoding": "gzip" });
    response.end(gzipSync(Buffer.from(body, "utf8")));
  });
  try {
    assert.equal((await fetchHttpsSpec(`${server.url}/spec.md`)).toString("utf8"), body);
  } finally {
    await server.close();
  }
});
