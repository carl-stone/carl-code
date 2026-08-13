// permission-gate.ts — carl-code harness extension
//
// Prompts for confirmation before potentially dangerous/irreversible actions, so
// the model doesn't guess its way into something costly without a human check.
//
// Two guards, via the `tool_call` hook (which runs BEFORE the tool executes and
// can block it):
//
//   1. Bash: patterns that are risky or irreversible (rm -rf, sudo, mkfs, dd,
//      chmod/chown 777, catastrophic pipes, etc.).
//   2. Paths: write/edit/delete that lands outside the project tree, or on a
//      machine-critical file (e.g. ~/.pi/*), unless the user allows it.
//
// Config (optional), read from ~/.pi/agent/permission-gate.json:
//   { "blockWhenNoUI": true, "allowBashPatterns": [], "allowPaths": [] }
//
// In non-interactive/no-UI contexts we refuse by default rather than guess.

import type { ExtensionAPI, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, normalize, join } from "node:path";

const CONFIG_PATH = join(homedir(), ".pi", "agent", "permission-gate.json");

interface Config {
  blockWhenNoUI?: boolean;
  allowBashPatterns?: string[];
  allowPaths?: string[];
}

function loadConfig(): Config {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return {
      blockWhenNoUI: raw.blockWhenNoUI !== false,
      allowBashPatterns: Array.isArray(raw.allowBashPatterns) ? raw.allowBashPatterns : [],
      allowPaths: Array.isArray(raw.allowPaths) ? raw.allowPaths : [],
    };
  } catch {
    return { blockWhenNoUI: true, allowBashPatterns: [], allowPaths: [] };
  }
}

// Commands that are DESTRUCTIVE AND IRREVERSIBLE — they delete or overwrite
// data that cannot be recovered, or force-rewrite shared history. We
// intentionally do NOT block merely-insecure or disruptive-but-recoverable
// commands (chmod 777, sudo, pkill, reboot): the gate should stop real
// irreversible damage, not annoy every session.
const DANGEROUS_BASH = [
  /\brm\s+(-[a-z]*[rf]|--recursive|--force)/i, // recursive/force delete (irreversible)
  /\bmkfs(?:\.\w+)?\b/i,                     // format a filesystem (wipes data)
  /\bdd\b[\s\S]*\bof=\/dev\//i,           // dd writing directly to a raw device
  /\bgit\s+push\s+(-f|--force)/i,             // force push rewrites remote history
  /\bgit\s+reset\s+--hard\b/i,               // discards uncommitted changes
  /\bgit\s+clean\s+-f/i,                      // deletes untracked files
];

// Machine-critical / private paths we never let a tool write blindly.
const PROTECTED_PATH_MARKERS = [
  (p: string) => p.startsWith(join(homedir(), ".pi")),
];

export default function (pi: ExtensionAPI) {
  const cfg = loadConfig();

  function isProtected(path: string): boolean {
    return PROTECTED_PATH_MARKERS.some((test) => test(path));
  }

  // True when `target` (absolute) is outside `base` (absolute) — i.e. escapes the project tree.
  function isOutside(target: string, base: string): boolean {
    const rel = relative(base, target);
    return rel.startsWith("..") || isAbsolute(rel);
  }

  function shouldAskBash(command: string): string | null {
    if (cfg.allowBashPatterns?.some((p) => new RegExp(p).test(command))) return null;
    for (const pattern of DANGEROUS_BASH) {
      if (pattern.test(command)) return pattern.toString();
    }
    return null;
  }

  function shouldAskPath(event: ToolCallEvent, cwd: string): string | null {
    const tool = event.toolName;
    if (tool !== "write" && tool !== "edit" && tool !== "bash" && tool !== "delete") return null;
    if (tool === "bash") return null; // bash handled by command patterns

    // dig out the target path(s) from the input
    const input = (event.input ?? {}) as Record<string, unknown>;
    const candidates: string[] = [];
    if (tool === "bash") return null;
    for (const key of ["path", "filePath", "file_path"]) {
      if (typeof input[key] === "string") candidates.push(input[key] as string);
    }

    if (cfg.allowPaths?.length) {
      if (candidates.some((c) => cfg.allowPaths!.includes(c))) return null;
    }

    for (const raw of candidates) {
      if (!raw) continue;
      const absolute = isAbsolute(raw) ? normalize(raw) : resolve(cwd, raw);
      if (isProtected(absolute)) return absolute;
    }
    return null;
  }

  pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
    // Pull the project root so path checks are cwd-anchored.
    const cwd = ctx.cwd ?? process.cwd();

    if (event.toolName === "bash") {
      const command = (event.input as { command?: string }).command ?? "";
      const matched = shouldAskBash(command);
      if (!matched) return undefined;

      if (!ctx.hasUI) {
        return cfg.blockWhenNoUI
          ? { block: true, reason: `Dangerous command blocked (no UI for confirmation): ${matched}` }
          : undefined;
      }

      const choice = await ctx.ui.select(`⚠️ Dangerous bash command:\n\n  ${command}\n\nAllow?`, ["Yes", "No"]);
      return choice === "Yes" ? undefined : { block: true, reason: "Blocked by user (permission gate)" };
    }

    const protectedPath = shouldAskPath(event, cwd);
    if (!protectedPath) return undefined;

    if (!ctx.hasUI) {
      return cfg.blockWhenNoUI
        ? { block: true, reason: `Path protected: ${protectedPath} (no UI for confirmation)` }
        : undefined;
    }

    const choice = await ctx.ui.select(`⚠️ Modify protected path?\n\n  ${protectedPath}\n\nAllow?`, ["Yes", "No", "No, and don't ask again for it"]);
    if (choice === "Yes") return undefined;
    if (choice === "No, and don't ask again for it") {
      cfg.allowPaths!.push(protectedPath);
      return undefined;
    }
    return { block: true, reason: `Blocked by user (permission gate): ${protectedPath}` };
  });
}
