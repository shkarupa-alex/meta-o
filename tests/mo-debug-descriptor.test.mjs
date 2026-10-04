/**
 * Prove that `mo-debug` owns its descriptors: a session log is accepted only as
 * the very file it checked, and a report is written whole or not at all.
 *
 * Protects §A-DIAGNOSTICS-01: the diagnostic reads only the invoking user's own
 * session logs, and a report it cannot finish never stands as a complete one.
 */

import assert from "node:assert/strict";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { main } from "../shared/scripts/mo-debug.mjs";
import { openOwnedSession } from "../shared/scripts/mo-debug-sessions.mjs";

const FIXTURES = join(resolve(import.meta.dirname, ".."), "tests", "fixtures", "mo-debug");
const CLAUDE_ID = "5b0c3a52-7f6e-4d1a-9c2b-3e4f5a6b7c8d";
const CODEX_ID = "01a0f000-0000-7000-8000-000000000001";
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function temporary(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

/** A disposable HOME holding one Claude transcript and one Codex rollout. */
function fixtureHome() {
  const home = temporary("mo-debug-home-");
  const claude = join(home, ".claude", "projects", "-work-project");
  const codex = join(home, ".codex", "sessions", "2026", "09", "01");
  mkdirSync(claude, { recursive: true });
  mkdirSync(codex, { recursive: true });
  copyFileSync(join(FIXTURES, "claude-session.jsonl"), join(claude, `${CLAUDE_ID}.jsonl`));
  copyFileSync(
    join(FIXTURES, "codex-session.jsonl"),
    join(codex, `rollout-2026-09-01T11-00-00-${CODEX_ID}.jsonl`),
  );
  return { home, claude, codex };
}

test("a log that vanishes or fails after its open is refused alone and its descriptor closed", () => {
  const { home, claude } = fixtureHome();
  const log = join(claude, `${CLAUDE_ID}.jsonl`);
  const opening = (overrides) => {
    const closed = [];
    const io = {
      open: openSync,
      fstat: fstatSync,
      stat: statSync,
      close: (fd) => {
        closed.push(fd);
        closeSync(fd);
      },
      ...overrides,
    };
    return { io, closed };
  };
  // (1) Renamed between the open and the check: the old path answers ENOENT.
  const renamed = opening({
    stat: (path) => {
      renameSync(log, `${log}.moved`);
      return statSync(path);
    },
  });
  assert.deepEqual(openOwnedSession(log, home, null, renamed.io), { outcome: "foreign_path" });
  assert.equal(renamed.closed.length, 1);
  renameSync(`${log}.moved`, log);
  // (2) The descriptor itself cannot be stated.
  const failing = opening({
    fstat: () => {
      throw Object.assign(new Error("EIO"), { code: "EIO" });
    },
  });
  assert.deepEqual(openOwnedSession(log, home, null, failing.io), { outcome: "foreign_path" });
  assert.equal(failing.closed.length, 1);
  // (3) The same log, left alone, is still the user's own and stays open.
  const stable = opening({});
  const opened = openOwnedSession(log, home, null, stable.io);
  assert.equal(opened.harness, "claude");
  assert.deepEqual(stable.closed, []);
  closeSync(opened.fd);
});

test("a parent directory swapped for a link around the open never yields the outside file", () => {
  const harnesses = [
    { name: "claude", dir: (fixture) => fixture.claude, file: `${CLAUDE_ID}.jsonl` },
    {
      name: "codex",
      dir: (fixture) => fixture.codex,
      file: `rollout-2026-09-01T11-00-00-${CODEX_ID}.jsonl`,
    },
  ];
  // The kernel's name for the descriptor where Linux has one, and the path
  // resolved again where it does not; both must hold the same line.
  const locators = existsSync("/proc/self/fd") ? ["kernel", "path"] : ["path"];
  for (const harness of harnesses) {
    for (const locator of locators) {
      const label = `${harness.name}/${locator}`;
      const setup = () => {
        const fixture = fixtureHome();
        const parent = harness.dir(fixture);
        const outside = temporary("mo-debug-outside-");
        writeFileSync(join(outside, harness.file), '{"outside":true}\n');
        const swap = () => {
          renameSync(parent, `${parent}.saved`);
          symlinkSync(outside, parent);
        };
        return { home: fixture.home, parent, outside, log: join(parent, harness.file), swap };
      };
      const watched = (open) => {
        const opened = [];
        const closed = [];
        const io = {
          open: (path, flags) => {
            const fd = open(path, flags);
            opened.push(fd);
            return fd;
          },
          close: (fd) => {
            closed.push(fd);
            closeSync(fd);
          },
          ...(locator === "path" ? { locate: () => null } : {}),
        };
        return { io, opened, closed };
      };
      const refused = (result, watch, why) => {
        assert.deepEqual(result, { outcome: "foreign_path" }, `${label}: ${why}`);
        assert.deepEqual(watch.closed, watch.opened, `${label}: ${why} closes each fd once`);
      };
      // (1) The parent becomes a link to the outside directory before the open.
      {
        const { home, log, swap } = setup();
        const watch = watched((path, flags) => {
          swap();
          return openSync(path, flags);
        });
        refused(openOwnedSession(log, home, null, watch.io), watch, "swapped before the open");
        assert.equal(watch.opened.length, 1, label);
      }
      // (2) The same swap right after the open, before the descriptor is checked.
      {
        const { home, log, swap } = setup();
        const watch = watched((path, flags) => {
          const fd = openSync(path, flags);
          swap();
          return fd;
        });
        refused(openOwnedSession(log, home, null, watch.io), watch, "swapped after the open");
      }
      // (3) A link in the last component, planted before the call or inside the open.
      {
        const { home, log, outside } = setup();
        renameSync(log, `${log}.saved`);
        symlinkSync(join(outside, harness.file), log);
        const watch = watched(openSync);
        refused(openOwnedSession(log, home, null, watch.io), watch, "last component link");
        assert.deepEqual(watch.opened, [], label);
      }
      {
        const { home, log, outside } = setup();
        const watch = watched((path, flags) => {
          renameSync(log, `${log}.saved`);
          symlinkSync(join(outside, harness.file), log);
          return openSync(path, flags);
        });
        refused(openOwnedSession(log, home, null, watch.io), watch, "link inside the open");
        assert.deepEqual(watch.opened, [], label);
      }
      // (4) The user's own log, left alone, is accepted and stays open.
      {
        const { home, log } = setup();
        const watch = watched(openSync);
        const accepted = openOwnedSession(log, home, null, watch.io);
        assert.equal(accepted.harness, harness.name, label);
        assert.deepEqual(watch.closed, [], label);
        closeSync(accepted.fd);
      }
      // (5) A root that was a link before the call still reaches the user's own logs.
      {
        const { home, log } = setup();
        const root = join(
          home,
          `.${harness.name}`,
          harness.name === "claude" ? "projects" : "sessions",
        );
        const moved = join(home, `${harness.name}-root-elsewhere`);
        renameSync(root, moved);
        symlinkSync(moved, root);
        const watch = watched(openSync);
        const accepted = openOwnedSession(log, home, null, watch.io);
        assert.equal(accepted.harness, harness.name, label);
        assert.deepEqual(watch.closed, [], label);
        closeSync(accepted.fd);
      }
    }
  }
});

test("a report that cannot be written whole is emptied and fails typed after the scan lines", () => {
  const { home } = fixtureHome();
  // main is called in-process so the write can fail on cue; its output is
  // captured instead of reaching the test runner.
  const inProcess = (out, io) => {
    const captured = { stdout: "", stderr: "" };
    const original = { stdout: process.stdout.write, stderr: process.stderr.write };
    process.stdout.write = (chunk) => {
      captured.stdout += chunk;
      return true;
    };
    process.stderr.write = (chunk) => {
      captured.stderr += chunk;
      return true;
    };
    try {
      captured.status = main(["scan", "--session", CLAUDE_ID, "--out", out], { HOME: home }, io);
    } finally {
      process.stdout.write = original.stdout;
      process.stderr.write = original.stderr;
    }
    return captured;
  };
  const enospc = () => Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
  const scripted = (steps, fsync = fsyncSync) => {
    let call = 0;
    const fds = [];
    const write = (fd, buffer, offset, length) => {
      fds.push(fd);
      const step = steps[Math.min(call, steps.length - 1)];
      call += 1;
      if (step === "throw") throw enospc();
      const size = step === "short" ? length - 1 : length;
      return writeSync(fd, buffer, offset, size);
    };
    return { io: { write, fsync }, fds };
  };
  const reference = join(temporary("mo-debug-out-"), "report.md");
  assert.equal(inProcess(reference).status, 0);
  const expected = readFileSync(reference, "utf8");
  // (1) A short first write is followed by the rest: the report is whole.
  const out1 = join(temporary("mo-debug-out-"), "report.md");
  const short = scripted(["short", "full"]);
  const whole = inProcess(out1, short.io);
  assert.equal(whole.status, 0, whole.stderr);
  assert.equal(readFileSync(out1, "utf8"), expected);
  assert.match(whole.stdout, /^MO-DEBUG\/1 status=ok /u);
  assert.equal(short.fds.length, 2);
  // (2) Part written, then ENOSPC; (3) ENOSPC at once; (4) the fsync fails.
  const failing = [
    ["part then ENOSPC", scripted(["short", "throw"])],
    ["ENOSPC at once", scripted(["throw"])],
    [
      "fsync EIO",
      scripted(["full"], () => {
        throw Object.assign(new Error("EIO"), { code: "EIO" });
      }),
    ],
  ];
  for (const [label, { io, fds }] of failing) {
    const out = join(temporary("mo-debug-out-"), "report.md");
    const result = inProcess(out, io);
    assert.equal(result.status, 2, label);
    assert.match(result.stdout, /^MO-DEBUG\/1 status=ok sessions=1 /u, label);
    assert.match(result.stdout, /^session id=/mu, label);
    assert.equal(result.stderr, "MO-DEBUG/1 status=error reason=out_write_failed\n", label);
    assert.equal(statSync(out).size, 0, label);
    assert.throws(() => fstatSync(fds[0]), { code: "EBADF" }, `${label}: descriptor closed`);
  }
});
