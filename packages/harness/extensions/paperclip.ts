// paperclip.ts — carl-code harness extension
//
// Wraps the Paperclip CLI (https://paperclip.gxl.ai) as a single custom tool so
// the agent can search, read, grep, and run AI readers over 11M+ papers, FDA
// docs, clinical trials, and biological databases without leaving the session.
//
// The CLI is invoked directly via node:child_process so we can inject the API
// key into the child environment. The key is resolved, in order:
//   1. PAPERCLIP_API_KEY env var (inherited by the pi process)
//   2. ~/.paperclip/api_key  (chmod 600 file; written by the install flow)
// The CLI itself never persists keys, so this file is the local source of truth.
//
// The tool exposes the full CLI surface as one flexible argv: pass the tokens
// that would follow `paperclip` on the command line. The guidelines teach the
// search → map → reduce workflow and the `-s/--source` requirement for search.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BINARY = "paperclip";
const FALLBACK_BINARY = join(homedir(), ".local", "bin", "paperclip");
const KEY_FILE = join(homedir(), ".paperclip", "api_key");
// map/reduce can take minutes over many papers; keep a generous ceiling.
const DEFAULT_TIMEOUT_MS = 600_000;
// Cap how much stdout we hand back to the model so a giant `cat` can't blow
// the context budget. The CLI already truncates most commands, but enforce it.
const MAX_OUTPUT_CHARS = 60_000;

function resolveApiKey(): string | null {
  if (process.env.PAPERCLIP_API_KEY) return process.env.PAPERCLIP_API_KEY;
  try {
    if (existsSync(KEY_FILE)) {
      const k = readFileSync(KEY_FILE, "utf8").trim();
      return k.length > 0 ? k : null;
    }
  } catch {
    // fall through
  }
  return null;
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  const head = text.slice(0, MAX_OUTPUT_CHARS);
  return `${head}\n\n…[output truncated: ${text.length - MAX_OUTPUT_CHARS} more chars]`;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "paperclip",
    label: "Paperclip",
    description:
      "Run a Paperclip CLI command to search, read, grep, and run AI readers over 11M+ papers, " +
      "225K+ FDA/regulatory documents, 1M+ clinical trials, and biological databases (UniProt, PDB, ChEMBL). " +
      "Pass the argv tokens that would follow `paperclip` on the command line.",
    promptSnippet:
      "Run Paperclip CLI commands (search, cat, grep, map, reduce, sql, ls, head) over papers, FDA docs, trials, and bio databases",
    promptGuidelines: [
      "Use paperclip to search biomedical literature, regulatory documents, clinical trials, and protein databases instead of web_search when the user wants peer-reviewed or primary scientific sources.",
      "paperclip search REQUIRES a -s/--source flag. Common sources: pmc, biorxiv, medrxiv, arxiv, abstracts, fda, trials, proteins, uniprot, pdb, chembl. Combine with commas (e.g. -s pmc,biorxiv).",
      "paperclip map runs an AI reader over every paper in a prior search result and can take minutes; keep search sets small (-n 3 to 10) before mapping. Pass the result id from search (s_xxx) with --from.",
      "paperclip reduce synthesizes per-paper answers from a map (m_xxx) into one narrative or table; pass --from with the map id.",
      "paperclip read workflow: search → (optional grep --from or filter --from to narrow) → map --from → reduce --from. Capture the result id printed as [s_xxx] / [m_xxx] and reuse it.",
      "paperclip cat, head, and grep read individual papers at /papers/<id>/content.lines or /papers/<id>/meta.json. Use head -N on large content.lines rather than cat.",
    ],
    parameters: Type.Object({
      args: Type.Array(Type.String(), {
        description:
          "Argv tokens after `paperclip`. Example for a PMC search: [\"search\", \"-s\", \"pmc\", \"CRISPR base editing\", \"-n\", \"5\"]. " +
          "For reading a paper: [\"cat\", \"/papers/PMC7503568/meta.json\"]. " +
          "For mapping over a search result: [\"map\", \"--from\", \"s_abc123\", \"What methods were used?\"]",
      }),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const args = (params.args ?? []) as string[];
      if (args.length === 0) {
        throw new Error("paperclip requires at least one argument (the subcommand).");
      }

      const apiKey = resolveApiKey();
      if (!apiKey) {
        throw new Error(
          "No Paperclip API key found. Set PAPERCLIP_API_KEY in your environment or write the key to ~/.paperclip/api_key (chmod 600).",
        );
      }

      const env = { ...process.env, PAPERCLIP_API_KEY: apiKey };

      // map / reduce / ask-image can be long; give them the full ceiling.
      const slow = new Set(["map", "reduce", "ask-image", "ask_image", "fetch", "sync"]);
      const timeoutMs = slow.has(args[0]) ? DEFAULT_TIMEOUT_MS : 120_000;

      return await new Promise((resolve, reject) => {
        const child = execFile(
          BINARY,
          args,
          { env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
          (err, stdout, stderr) => {
            if (err && !("code" in err) && !stdout) {
              // spawn-level failure (ENOENT, etc.)
              if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                // retry the known fallback path once
                execFile(
                  FALLBACK_BINARY,
                  args,
                  { env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
                  (err2, stdout2, stderr2) => {
                    if (err2 && !("code" in err2) && !stdout2) {
                      reject(
                        new Error(
                          `Failed to run paperclip (${(err2 as Error).message}). Is the CLI installed at ~/.local/bin/paperclip?`,
                        ),
                      );
                      return;
                    }
                    const code2 = (err2 as { code?: number } | null)?.code ?? 0;
                    finish(stdout2 ?? "", stderr2 ?? "", code2, resolve, reject);
                  },
                );
                return;
              }
              reject(err);
              return;
            }
            const code = (err as { code?: number } | null)?.code ?? 0;
            finish(stdout ?? "", stderr ?? "", code, resolve, reject);
          },
        );

        function finish(stdout: string, stderr: string, code: number, resolve, reject) {
          if (code !== 0) {
            const msg = truncate(
              `paperclip ${args.join(" ")} exited with code ${code}.\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
            );
            reject(new Error(msg));
            return;
          }
          const out = truncate(stdout + (stderr.trim() ? `\n[stderr]\n${stderr}` : ""));
          resolve({
            content: [{ type: "text", text: out || "(no output)" }],
            details: { args, code, chars: out.length },
          });
        }

        if (signal) {
          if (signal.aborted) child.kill("SIGTERM");
          else signal.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
        }
      });
    },
  });
}
