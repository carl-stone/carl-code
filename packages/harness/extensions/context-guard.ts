// context-guard.ts — carl-code harness extension
//
// Lets you set a custom "max context" limit (in tokens). It:
//   - persistently stores the limit in ~/.pi/agent/context-guard.json (global,
//     survives restarts and /reload)
//   - shows a live status in the footer: current context vs. the limit, as
//     tokens and as a percentage
//   - auto-compacts when the current context crosses above the limit
//
// Commands:
//   /ctxmax 100000    set the max context to 100k tokens
//   /ctxmax 0 | off   disable auto-compaction at a limit (pi's built-in still applies)
//   /ctxmax           show the current limit + live usage
//
// Note: pi's built-in auto-compaction (contextWindow - reserveTokens) still
// runs independently. This extension enforces YOUR tighter/custom limit on top.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_PATH = join(homedir(), ".pi", "agent", "context-guard.json");
const STATUS_ID = "ctx-guard";
const DEFAULT_MAX_TOKENS = 100_000;
const DISABLED = 0; // 0 = no auto-compaction at a custom limit

interface Config {
  maxTokens: number;
}

function loadConfig(): Config {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    const n = Number(raw?.maxTokens);
    return { maxTokens: Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_MAX_TOKENS };
  } catch {
    return { maxTokens: DEFAULT_MAX_TOKENS };
  }
}

function saveConfig(cfg: Config) {
  try {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.error("context-guard: failed to write config", err);
  }
}

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
};

export default function (pi: ExtensionAPI) {
  const cfg = loadConfig();
  let previousTokens: number | null | undefined;

  const currentLimit = () => (cfg.maxTokens > 0 ? cfg.maxTokens : null);

  function renderStatus(ctx: ExtensionContext, usageTokens: number | null | undefined) {
    const limit = currentLimit();
    const theme = ctx.ui.theme;
    if (!limit) {
      // Disabled: clear any stale widget
      ctx.ui.setStatus(STATUS_ID, undefined);
      return;
    }
    const tokens = usageTokens ?? ctx.getContextUsage()?.tokens ?? 0;
    const pct = Math.min(100, (tokens / limit) * 100);
    const color = pct >= 90 ? "error" : pct >= 70 ? "warning" : "success";
    const tokenText = theme.fg("dim", `${fmt(tokens)}/${fmt(limit)}`);
    const pctText = color === "error" ? theme.fg("error", ` ${pct.toFixed(0)}%`) : color === "warning" ? theme.fg("warning", ` ${pct.toFixed(0)}%`) : theme.fg("success", ` ${pct.toFixed(0)}%`);
    ctx.ui.setStatus(STATUS_ID, tokenText + pctText);
  }

  function maybeCompact(ctx: ExtensionContext, currentTokens: number | null | undefined) {
    const limit = currentLimit();
    if (!limit || currentTokens == null) return;
    const crossed = previousTokens == null || previousTokens <= limit;
    previousTokens = currentTokens;
    if (!crossed || currentTokens <= limit) return;
    if (ctx.hasUI) ctx.ui.notify(`Auto-compacting at ${fmt(currentTokens)} tokens (limit ${fmt(limit)})`, "info");
    ctx.compact({ onError: (e) => ctx.ui.notify(`Compaction failed: ${e.message}`, "error") });
  }

  pi.on("session_start", async (_e, ctx) => {
    previousTokens = null;
    renderStatus(ctx, null);
  });

  pi.on("turn_end", (_e, ctx) => {
    const usageTokens = ctx.getContextUsage()?.tokens ?? null;
    renderStatus(ctx, usageTokens);
    maybeCompact(ctx, usageTokens);
  });

  pi.on("model_select", (_e, ctx) => {
    previousTokens = null;
    renderStatus(ctx, null);
  });

  pi.registerCommand("ctxmax", {
    description: "Set / show the custom max-context auto-compact limit (tokens). Use 'off' or 0 to disable.",
    handler: async (args, ctx) => {
      const arg = args.trim();
      if (!arg) {
        const tokens = ctx.getContextUsage()?.tokens ?? 0;
        const limit = currentLimit();
        ctx.ui.notify(
          limit ? `ctx-max: ${fmt(limit)} tokens | current: ${fmt(tokens)} (${Math.round((tokens / limit) * 100)}%)` : "ctx-max: disabled",
          "info",
        );
        return;
      }
      if (arg === "off" || arg === "0") {
        cfg.maxTokens = DISABLED;
        saveConfig(cfg);
        previousTokens = null;
        renderStatus(ctx, null);
        ctx.ui.notify("ctx-max disabled (built-in auto-compaction still applies)", "info");
        return;
      }
      const n = Number(arg.replace(/[,_k]/g, (m) => (m === "k" ? "000" : "")));
      if (!Number.isFinite(n) || n <= 0) {
        ctx.ui.notify(`Invalid limit "${arg}". Use e.g. /ctxmax 100000 or /ctxmax 100k`, "error");
        return;
      }
      cfg.maxTokens = Math.floor(n);
      saveConfig(cfg);
      previousTokens = null;
      const tokens = ctx.getContextUsage()?.tokens ?? 0;
      renderStatus(ctx, tokens);
      ctx.ui.notify(`ctx-max set to ${fmt(cfg.maxTokens)} tokens (current ${fmt(tokens)})`, "info");
      maybeCompact(ctx, tokens);
    },
  });
}
