/**
 * §M-CLI-ARGS — Argument parsing and JSON I/O shared by every CLI command.
 *
 * Implements §A-SKILL-TOOLING. Skills are prompts driving a model, and a model
 * composing shell commands will get flags subtly wrong. A single strict parser
 * that rejects unknown flags turns those mistakes into immediate, explicit
 * errors instead of silently ignored options that change a gate's meaning.
 */

/** §M-CLI-ARGS — Parsed command line: positional words plus flags. */
export interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | boolean>;
}

/** §M-CLI-ARGS — Raised for malformed or unknown command line input. */
export class UsageError extends Error {
  /** §M-CLI-ARGS — Mark the error so the router can exit with a usage status. */
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/**
 * §M-CLI-ARGS — Parse `--flag value`, `--flag=value` and `--boolean` forms.
 *
 * Deliberately does not support single-dash short flags: abbreviations invite
 * guessing, and every caller here is a script or a skill, not a human typing.
 *
 * A bare `--` ends meta-o's own arguments and passes everything after it
 * through as positional, verbatim. That is what the skills and this CLI's own
 * error messages tell callers to write, and it used to be refused outright —
 * so `worktree run … -- pytest --maxfail=1` failed, and without the terminator
 * the gate's own `--maxfail` was read as a meta-o flag and rejected as unknown.
 * The one sanctioned way to run a gate in isolation could not run any gate that
 * takes an argument.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === "--") {
      positional.push(...argv.slice(index + 1));
      break;
    }
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      flags.set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(body, next);
      index += 1;
    } else {
      flags.set(body, true);
    }
  }

  return { positional, flags };
}

/** §M-CLI-ARGS — Read a required string flag or fail with a usable message. */
export function requireFlag(args: ParsedArgs, name: string): string {
  const value = args.flags.get(name);
  if (typeof value !== "string" || value === "") {
    throw new UsageError(`--${name} is required`);
  }
  return value;
}

/** §M-CLI-ARGS — Read an optional string flag. */
export function optionalFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

/** §M-CLI-ARGS — Read a boolean flag, treating presence as true. */
export function boolFlag(args: ParsedArgs, name: string): boolean {
  const value = args.flags.get(name);
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  return value !== "false" && value !== "0";
}

/**
 * §M-CLI-ARGS — Read the whole of standard input.
 *
 * Structured payloads — plans, review results, findings — arrive on stdin
 * rather than as flags, so that quoting a large JSON document is never the
 * caller's problem.
 */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** §M-CLI-ARGS — Read and parse a JSON payload from stdin. */
export async function readStdinJson<T>(): Promise<T> {
  const text = (await readStdin()).trim();
  if (text === "") throw new UsageError("expected a JSON payload on stdin");
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new UsageError(`stdin is not valid JSON: ${(error as Error).message}`);
  }
}

/** §M-CLI-ARGS — Emit a successful machine-readable result. */
export function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * §M-CLI-ARGS — Emit a failure in the same shape every time.
 *
 * Callers are scripts and prompts; a predictable error envelope means they can
 * branch on `error.code` instead of matching free text that changes.
 */
export function fail(code: string, message: string, extra?: Record<string, unknown>): never {
  process.stderr.write(`${JSON.stringify({ error: { code, message, ...extra } }, null, 2)}\n`);
  process.exit(1);
}
