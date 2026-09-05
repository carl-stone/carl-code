import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAgentDir,
  type BeforeAgentStartEvent,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Key,
  matchesKey,
  truncateToWidth,
  type TUI,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

const defaultPromptPath = fileURLToPath(new URL("../system/SYSTEM.md", import.meta.url));
const customPromptPath = join(getAgentDir(), "SYSTEM.md");

type ViewerAction = "close" | "edit" | "replace" | "reset";

function readDefaultPrompt(): string {
  return readFileSync(defaultPromptPath, "utf8").trim();
}

function readCustomPrompt(): string | undefined {
  if (!existsSync(customPromptPath)) return undefined;
  const prompt = readFileSync(customPromptPath, "utf8").trim();
  return prompt || undefined;
}

function readPrompt(): string {
  return readCustomPrompt() ?? readDefaultPrompt();
}

function savePrompt(prompt: string): void {
  mkdirSync(dirname(customPromptPath), { recursive: true });
  writeFileSync(customPromptPath, `${prompt.trimEnd()}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function applyIdentity(systemPrompt: string, customPrompt: boolean, identity: string): string {
  if (systemPrompt.startsWith(identity)) return systemPrompt;
  if (customPrompt) return `${identity}\n\n${systemPrompt}`;

  const toolsMarker = "\n\nAvailable tools:";
  const toolsIndex = systemPrompt.indexOf(toolsMarker);
  if (toolsIndex >= 0) {
    return `${identity}${systemPrompt.slice(toolsIndex)}`;
  }

  return `${identity}\n\n${systemPrompt}`;
}

function getEffectivePrompt(ctx: ExtensionCommandContext): string {
  const options = ctx.getSystemPromptOptions?.();
  return applyIdentity(ctx.getSystemPrompt(), Boolean(options?.customPrompt), readPrompt());
}

class SystemPromptViewer implements Component {
  private readonly prompt: string;
  private readonly theme: Theme;
  private readonly tui: TUI;
  private readonly close: (action: ViewerAction) => void;
  private wrappedLines: string[] = [];
  private wrappedWidth = 0;
  private scrollTop = 0;
  private viewportHeight = 1;

  constructor(
    prompt: string,
    theme: Theme,
    tui: TUI,
    close: (action: ViewerAction) => void,
  ) {
    this.prompt = prompt;
    this.theme = theme;
    this.tui = tui;
    this.close = close;
  }

  private border(text: string): string {
    return this.theme.fg("borderAccent", text);
  }

  private frameLine(content: string, width: number): string {
    const contentWidth = Math.max(1, width - 4);
    const clipped = truncateToWidth(content, contentWidth, "");
    const padding = " ".repeat(Math.max(0, contentWidth - visibleWidth(clipped)));
    return `${this.border("│")} ${clipped}${padding} ${this.border("│")}`;
  }

  private rule(left: string, middle: string, right: string, width: number): string {
    return this.border(`${left}${middle.repeat(Math.max(1, width - 2))}${right}`);
  }

  private maxScrollTop(): number {
    return Math.max(0, this.wrappedLines.length - this.viewportHeight);
  }

  private scrollBy(lines: number): void {
    this.scrollTop = Math.max(0, Math.min(this.maxScrollTop(), this.scrollTop + lines));
  }

  render(width: number): string[] {
    const panelWidth = Math.max(8, width);
    const contentWidth = Math.max(1, panelWidth - 4);
    if (this.wrappedWidth !== contentWidth) {
      this.wrappedLines = wrapTextWithAnsi(this.prompt, contentWidth);
      this.wrappedWidth = contentWidth;
    }

    const terminalRows = this.tui.terminal.rows ?? 24;
    const panelHeight = Math.max(8, Math.min(Math.floor(terminalRows * 0.9), terminalRows - 2));
    this.viewportHeight = Math.max(1, panelHeight - 7);
    this.scrollTop = Math.min(this.scrollTop, this.maxScrollTop());

    const body = this.wrappedLines.slice(this.scrollTop, this.scrollTop + this.viewportHeight);
    while (body.length < this.viewportHeight) body.push("");
    const firstLine = this.wrappedLines.length === 0 ? 0 : this.scrollTop + 1;
    const lastLine = Math.min(this.wrappedLines.length, this.scrollTop + this.viewportHeight);
    const scrollStatus = `${firstLine}-${lastLine} of ${this.wrappedLines.length}`;

    return [
      this.rule("╭", "─", "╮", panelWidth),
      this.frameLine(this.theme.bold(this.theme.fg("accent", "Current Carl Code system prompt")), panelWidth),
      this.rule("├", "─", "┤", panelWidth),
      ...body.map((line) => this.frameLine(line, panelWidth)),
      this.rule("├", "─", "┤", panelWidth),
      this.frameLine(this.theme.fg("dim", `↑↓/jk scroll · PgUp/PgDn page · g/G ends · ${scrollStatus}`), panelWidth),
      this.frameLine(this.theme.fg("muted", "[e] edit · [n] replace · [r] reset · [esc/q] close"), panelWidth),
      this.rule("╰", "─", "╯", panelWidth),
    ];
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q") {
      this.close("close");
      return;
    }
    if (data === "e" || data === "n" || data === "r") {
      this.close(data === "e" ? "edit" : data === "n" ? "replace" : "reset");
      return;
    }
    if (matchesKey(data, Key.up) || data === "k") this.scrollBy(-1);
    else if (matchesKey(data, Key.down) || data === "j") this.scrollBy(1);
    else if (matchesKey(data, Key.pageUp)) this.scrollBy(-this.viewportHeight);
    else if (matchesKey(data, Key.pageDown)) this.scrollBy(this.viewportHeight);
    else if (matchesKey(data, Key.home) || data === "g") this.scrollTop = 0;
    else if (matchesKey(data, Key.end) || data === "G") this.scrollTop = this.maxScrollTop();
    else return;
    this.tui.requestRender();
  }

  invalidate(): void {
    this.wrappedWidth = 0;
  }
}

async function showPrompt(ctx: ExtensionCommandContext): Promise<ViewerAction> {
  const prompt = getEffectivePrompt(ctx);
  return ctx.ui.custom<ViewerAction>(
    (tui, theme, _keybindings, done) => new SystemPromptViewer(prompt, theme, tui, done),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "90%",
        maxHeight: "90%",
        margin: 1,
      },
    },
  );
}

export default function carlIdentity(pi: ExtensionAPI) {
  pi.registerCommand("system-prompt", {
    description: "Show, edit, replace, or reset the Carl Code system prompt",
    handler: async (args, ctx) => {
      let action = args.trim().toLowerCase() || "show";

      if (action === "show") {
        action = await showPrompt(ctx);
        if (action === "close") return;
      }

      if (action === "reset") {
        if (!existsSync(customPromptPath)) {
          ctx.ui.notify("The repository default is already active.", "info");
          return;
        }
        const confirmed = await ctx.ui.confirm(
          "Restore the default system prompt?",
          `This removes the local override at ${customPromptPath}.`,
        );
        if (!confirmed) return;
        rmSync(customPromptPath, { force: true });
        ctx.ui.notify("Restored the repository default system prompt.", "info");
        return;
      }

      if (action !== "edit" && action !== "replace") {
        ctx.ui.notify("Usage: /system-prompt [show|edit|replace|reset]", "warning");
        return;
      }

      const prefill = action === "replace" ? "" : readPrompt();
      const edited = await ctx.ui.editor("Carl Code system prompt", prefill);
      if (edited === undefined) return;
      if (!edited.trim()) {
        ctx.ui.notify("The system prompt cannot be empty.", "warning");
        return;
      }

      if (edited.trim() === readDefaultPrompt()) {
        rmSync(customPromptPath, { force: true });
        ctx.ui.notify("The repository default system prompt is active.", "info");
        return;
      }

      savePrompt(edited);
      ctx.ui.notify(`Saved the local system prompt to ${customPromptPath}.`, "info");
    },
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent) => ({
    systemPrompt: applyIdentity(
      event.systemPrompt,
      Boolean(event.systemPromptOptions.customPrompt),
      readPrompt(),
    ),
  }));
}
