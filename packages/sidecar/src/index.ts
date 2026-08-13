/**
 * @carl-code/sidecar — the agent host.
 *
 * Embeds pi through the SDK (`createAgentSession*`), loads all harness
 * extensions via DefaultResourceLoader (same discovery as the TUI), and exposes
 * the agent to the GUI over a tiny JSONL IPC protocol on stdio.
 *
 * Layout:
 *   stdout  <-  JSONL ServerMessage (responses + forwarded agent events)
 *   stdin   ->  JSONL ClientMessage  (requests from the webview)
 *
 * The sidecar is the SOURCE OF TRUTH for session/agent state. The GUI never
 * touches pi directly; it only renders projections pushed here.
 */

import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import type { ClientMessage, ServerMessage, StateSnapshot } from "@carl-code/shared";

// ---------------------------------------------------------------------------
// Strict JSONL framing. We deliberately avoid readline (it splits on U+2028 /
// U+2029, which are valid inside JSON strings). Split on \n only.
// ---------------------------------------------------------------------------
const encode = (msg: ServerMessage) => process.stdout.write(JSON.stringify(msg) + "\n");

class LineReader {
  private buffer = "";
  constructor(private onLine: (line: string) => void) {}

  push(chunk: string) {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, "");
      this.buffer = this.buffer.slice(idx + 1);
      if (line.trim()) this.onLine(line);
    }
  }
}

// ---------------------------------------------------------------------------
// Main host
// ---------------------------------------------------------------------------
let session: AgentSession | undefined;
let seq = 0;
const pending = new Map<number, { resolve: (d: unknown) => void; reject: (e: Error) => void }>();

function send(msg: ServerMessage) {
  encode(msg);
}

function sendResponse(id: number, data?: unknown) {
  send({ type: "response", id, ok: true, data });
}
function sendError(id: number, error: string) {
  send({ type: "response", id, ok: false, error });
}
let loadedCommands: string[] = [];

function makeSnapshot(): StateSnapshot {
  if (!session) {
    return { sessionId: "", sessionName: undefined, model: undefined, thinkingLevel: "", isStreaming: false, messages: [], tools: [], commands: [], contextTokens: null };
  }
  return {
    sessionId: session.sessionId,
    sessionName: session.sessionFile,
    model: session.model?.id,
    thinkingLevel: session.thinkingLevel,
    isStreaming: session.isStreaming,
    messages: session.messages,
    tools: session.agent.state.tools.map((t) => t.name),
    commands: loadedCommands,
    contextTokens: null,
  };
}

function sendState() {
  if (session) send({ type: "state", state: makeSnapshot() });
}

async function initHost() {
  const modelRuntime = await ModelRuntime.create();
  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
  });
  await loader.reload();

  const { session: s } = await createAgentSession({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    modelRuntime,
    resourceLoader: loader,
    sessionManager: SessionManager.create(process.cwd()),
  });
  session = s;

  // Forward every SDK event verbatim to the GUI as a projection.
  session.subscribe((event: AgentSessionEvent) => {
    send({ type: "agent_event", event: event as unknown });
  });

  // Surface available slash commands to the GUI.
  loadedCommands = loader.getPrompts().prompts.map((p) => p.name);

  send({ type: "ready", sessionId: session.sessionId });
}

// ---------------------------------------------------------------------------
// Request dispatch
// ---------------------------------------------------------------------------
async function handle(msg: ClientMessage) {
  const id = (msg as { id?: number }).id;
  const method = msg.method;
  const params = (msg as { params?: unknown }).params ?? {};

  try {
    switch (method) {
      case "prompt": {
        const { text, streamingBehavior } = params as { text: string; streamingBehavior?: "steer" | "followUp" };
        await session?.prompt(text, { streamingBehavior });
        sendResponse(id);
        break;
      }
      case "steer": {
        const { text } = params as { text: string };
        await session?.steer(text);
        sendResponse(id);
        break;
      }
      case "followUp": {
        const { text } = params as { text: string };
        await session?.followUp(text);
        sendResponse(id);
        break;
      }
      case "abort":
        await session?.abort();
        sendResponse(id);
        break;
      case "getState":
        sendResponse(id, makeSnapshot());
        break;
      case "setModel": {
        const { modelId } = params as { modelId: string };
        // Model set handled via modelRuntime in a fuller implementation.
        sendResponse(id, { modelId });
        break;
      }
      case "ping":
        sendResponse(id, { pong: true, seq: seq++ });
        break;
      default:
        sendError(id, `Unknown method: ${method}`);
    }
  } catch (err) {
    sendError(id, err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Wire up stdio + boot
// ---------------------------------------------------------------------------
const reader = new LineReader((line) => {
  try {
    const msg = JSON.parse(line) as ClientMessage;
    void handle(msg);
  } catch (err) {
    send({ type: "fatal", error: `Bad JSON: ${(err as Error).message}` });
  }
});

process.stdin.on("data", (chunk) => reader.push(chunk.toString("utf8")));
process.stdin.on("end", () => process.exit(0));

// Register shutdown handlers so the GUI can cleanly stop us.
process.on("SIGTERM", () => {
  session?.dispose();
  process.exit(0);
});
process.on("SIGINT", () => {
  session?.dispose();
  process.exit(0);
});

void initHost().catch((err) => {
  send({ type: "fatal", error: `Host init failed: ${(err as Error).message}` });
});

// Re-export ExtensionAPI type so the surface is documented for tooling.
export type { ExtensionAPI };
