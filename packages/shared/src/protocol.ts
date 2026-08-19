/**
 * Typed JSON IPC protocol between the GUI (webview) and the agent sidecar.
 *
 * Principles:
 * - Plain JSON-serializable data only (no class instances, no functions).
 * - The agent sidecar is the source of truth; the GUI renders a projection of it.
 * - One protocol file shared by both sides via the `@carl-code/shared` workspace.
 *
 * Message framing over stdio (sidecar <-> Tauri relay) / Tauri invoke (webview):
 * `\n`-delimited JSONL of `ClientMessage` (webview -> sidecar) and
 * `ServerMessage` (sidecar -> webview).
 *
 * This file must remain dependency-free so it can be imported from anywhere.
 */

/* ------------------------------------------------------------------ *
 * Requests: webview -> sidecar (call/response, correlated by `id`)
 * ------------------------------------------------------------------ */

export interface Request<T = unknown> {
  id: number;
  method: string;
  params: T;
}

export type ClientMessage =
  | Request<{ text: string; streamingBehavior?: "steer" | "followUp" }> & { method: "prompt" }
  | Request<{ text: string }> & { method: "steer" }
  | Request<{ text: string }> & { method: "followUp" }
  | Request<{}> & { method: "abort" }
  | Request<{ modelId: string }> & { method: "setModel" }
  | Request<{}> & { method: "getState" }
  | Request<{}> & { method: "ping" }
  | { id: number; method: string; params: unknown };

/* ------------------------------------------------------------------ *
 * Responses / events: sidecar -> webview
 * ------------------------------------------------------------------ */

export interface Response<D = unknown> {
  type: "response";
  id: number;
  ok: boolean;
  data?: D;
  error?: string;
}

/** A single projected agent event forwarded verbatim from the SDK (plus metadata). */
export interface AgentEvent {
  type: "agent_event";
  /** The pi SDK event, JSON-safe, as received by `session.subscribe`. */
  event: unknown;
}

/** Full projected snapshot of session + capability state, returned by getState. */
export interface StateSnapshot {
  sessionId: string;
  sessionName: string | undefined;
  model: string | undefined;
  thinkingLevel: string;
  isStreaming: boolean;
  messages: unknown[];
  tools: string[];
  commands: string[];
  contextTokens: number | null;
}

export type ServerMessage =
  | Response
  | AgentEvent
  | { type: "state"; state: StateSnapshot }
  | { type: "ready"; sessionId: string }
  | { type: "fatal"; error: string };
