#!/usr/bin/env node

import { constants, copyFileSync, chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

// Handle runtime-update policy before importing Pi or touching user state.
if (process.argv[2] === "update" && !(
  process.argv.length === 4 && ["--extensions", "--models"].includes(process.argv[3])
)) {
  console.error("Pi runtime self-update is disabled in Carl Code. Use bun run update-pi <version> from the repository. For packages or models use carl update --extensions or carl update --models.");
  process.exit(1);
}

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const carlHome = resolve(process.env.CARL_CODE_HOME || join(homedir(), ".carl-code"));
const agentDir = join(carlHome, "agent");
const sessionDir = join(carlHome, "sessions");

for (const directory of [carlHome, agentDir, sessionDir]) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
}

const authPath = join(agentDir, "auth.json");
const piAuthPath = join(homedir(), ".pi", "agent", "auth.json");
const settingsPath = join(agentDir, "settings.json");
if (!existsSync(settingsPath) && !existsSync(authPath) && existsSync(piAuthPath)) {
  try {
    copyFileSync(piAuthPath, authPath, constants.COPYFILE_EXCL);
    chmodSync(authPath, 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

if (!existsSync(settingsPath)) {
  const settings = {
    defaultProvider: "openai-codex",
    defaultModel: "gpt-5.6-sol",
    defaultThinkingLevel: "high",
  };
  try {
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_CODING_AGENT_SESSION_DIR = sessionDir;
process.env.PI_SKIP_VERSION_CHECK ??= "1";
process.title = "carl";

const extensionsDir = join(rootDir, "packages", "harness", "extensions");
const extensionArgs = readdirSync(extensionsDir)
  .filter((name) => /\.(?:ts|js)$/.test(name) && !name.endsWith(".d.ts"))
  .sort()
  .flatMap((name) => ["--extension", join(extensionsDir, name)]);

const args = process.argv.slice(2);
const standaloneCommands = new Set(["install", "remove", "uninstall", "update", "list", "config", "auth"]);

const [{ DefaultPackageManager, main, parseArgs, ProjectTrustStore, SettingsManager, VERSION }, { truncateToWidth }] = await Promise.all([
  import("@earendil-works/pi-coding-agent"),
  import("@earendil-works/pi-tui"),
]);

const projectResourceEntries = ["package.json", "extensions", "skills", "prompts", "themes", "SYSTEM.md", "APPEND_SYSTEM.md"];

function hasCarlProjectResources(cwd) {
  const projectDir = join(cwd, ".carl-code");
  return projectResourceEntries.some((entry) => existsSync(join(projectDir, entry)));
}

function canPromptForTrust(parsed) {
  return Boolean(
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    !parsed.print &&
    parsed.mode === undefined &&
    !parsed.help &&
    !parsed.version &&
    !parsed.export &&
    parsed.listModels === undefined
  );
}

async function askProjectTrust(cwd, trustStore) {
  const prompt = [
    "Trust project folder?",
    cwd,
    "",
    "This allows Carl Code to load .pi and .carl-code project resources and execute project extensions.",
    "[y] trust and remember  [p] trust parent  [o] trust once  [n] do not trust and remember  [enter] skip once",
    "> ",
  ].join("\n");
  const input = createInterface({ input: process.stdin, output: process.stderr });
  try {
    while (true) {
      const answer = (await input.question(prompt)).trim().toLowerCase();
      if (answer === "y" || answer === "yes") {
        trustStore.set(cwd, true);
        return { trusted: true };
      }
      if (answer === "p" || answer === "parent") {
        const parent = dirname(resolve(cwd));
        trustStore.setMany([
          { path: parent, decision: true },
          { path: cwd, decision: null },
        ]);
        return { trusted: true };
      }
      if (answer === "o" || answer === "once") return { trusted: true, override: true };
      if (answer === "n" || answer === "no") {
        trustStore.set(cwd, false);
        return { trusted: false };
      }
      if (answer === "") return { trusted: false, override: false };
    }
  } finally {
    input.close();
  }
}

async function resolveCarlProjectTrust(cwd, parsed) {
  if (parsed.projectTrustOverride !== undefined) return { trusted: parsed.projectTrustOverride };
  const trustStore = new ProjectTrustStore(agentDir);
  const saved = trustStore.get(cwd);
  if (saved !== null) return { trusted: saved };
  const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: false });
  const defaultTrust = settings.getDefaultProjectTrust();
  if (defaultTrust === "always") return { trusted: true };
  if (defaultTrust === "never" || !canPromptForTrust(parsed)) return { trusted: false };
  return askProjectTrust(cwd, trustStore);
}

async function getCarlProjectArgs(cwd, parsed) {
  const projectDir = join(cwd, ".carl-code");
  const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: false });
  const resources = await new DefaultPackageManager({ cwd, agentDir, settingsManager }).resolveExtensionSources(
    [projectDir],
    { temporary: true },
  );
  const projectArgs = [];
  const appendResources = (flag, entries) => {
    for (const entry of entries) {
      if (entry.enabled) projectArgs.push(flag, entry.path);
    }
  };
  if (!parsed.noExtensions) appendResources("--extension", resources.extensions);
  if (!parsed.noSkills) appendResources("--skill", resources.skills);
  if (!parsed.noPromptTemplates) appendResources("--prompt-template", resources.prompts);
  if (!parsed.noThemes) appendResources("--theme", resources.themes);

  const systemPromptPath = join(projectDir, "SYSTEM.md");
  if (parsed.systemPrompt === undefined && existsSync(systemPromptPath)) {
    projectArgs.push("--system-prompt", systemPromptPath);
  }
  const appendSystemPromptPath = join(projectDir, "APPEND_SYSTEM.md");
  if (existsSync(appendSystemPromptPath)) {
    projectArgs.push("--append-system-prompt", appendSystemPromptPath);
  }
  return projectArgs;
}

let piArgs = args;
if (!standaloneCommands.has(args[0])) {
  const parsed = parseArgs(args);
  let projectArgs = [];
  let trustOverrideArgs = [];
  if (hasCarlProjectResources(process.cwd())) {
    const trust = await resolveCarlProjectTrust(process.cwd(), parsed);
    if (trust.trusted) projectArgs = await getCarlProjectArgs(process.cwd(), parsed);
    if (trust.override !== undefined) trustOverrideArgs = [trust.override ? "--approve" : "--no-approve"];
  }
  piArgs = [...extensionArgs, ...projectArgs, ...trustOverrideArgs, ...args];
}

const branding = {
  name: "carl-branding",
  hidden: true,
  factory(pi) {
    const setTitle = (ctx) => {
      const project = basename(ctx.cwd);
      const session = pi.getSessionName();
      const title = session ? `Carl Code · ${session} · ${project}` : `Carl Code · ${project}`;
      ctx.ui.setTitle(title);
      setTimeout(() => ctx.ui.setTitle(title), 0);
    };

    pi.on("session_start", async (_event, ctx) => {
      setTitle(ctx);
      if (ctx.mode !== "tui") return;
      ctx.ui.setHeader((_tui, theme) => ({
        render(width) {
          const name = theme.bold(theme.fg("accent", "Carl Code"));
          const runtime = theme.fg("dim", ` · powered by Pi v${VERSION}`);
          const tagline = theme.fg("muted", "Carl's personal agent for science, software, and life");
          return [truncateToWidth(`${name}${runtime}`, width), truncateToWidth(tagline, width)];
        },
        invalidate() {},
      }));
    });

    pi.on("session_info_changed", async (_event, ctx) => setTitle(ctx));
  },
};

await main(piArgs, { extensionFactories: [branding] });
