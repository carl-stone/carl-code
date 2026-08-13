import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ClientMessage, ServerMessage } from "@carl-code/shared";

/**
 * IPC bridge between the React GUI and the agent sidecar.
 *
 * The sidecar is the source of truth. This module is the ONLY place the GUI
 * talks to it. Everything the GUI renders flows through here.
 *
 * Transport: Tauri Rust shell relays JSONL over stdio. We call `invoke`
 * ("sidecar_send") to send a ClientMessage and subscribe to an event
 * ("sidecar_recv") for ServerMessages. If running outside Tauri (e.g. browser
 * dev), we fall back to spawning the sidecar directly over stdio.
 */

let seq = 0;
const pending = new Map<number, { resolve: (d: unknown) => void; reject: (e: Error) => void }>();
let onEvent: ((msg: ServerMessage) => void) | null = null;
export function registerEventSink(fn: (msg: ServerMessage) => void) {
  onEvent = fn;
}

/** Send a request and await its correlated response. */
export async function request(method: string, params: unknown = {}): Promise<unknown> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const msg: ClientMessage = { id, method, params };
    void invoke<null>("sidecar_send", { json: JSON.stringify(msg) }).catch((err) => {
      pending.delete(id);
      reject(err as Error);
    });
  });
}

function handleServerMessage(msg: ServerMessage) {
  if (msg.type === "response") {
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.data);
      else p.reject(new Error(msg.error ?? "unknown error"));
    }
    return;
  }
  onEvent?.(msg);
}

/** Initialize the bridge: subscribe to the Tauri relay. Call once at startup. */
export async function initBridge(): Promise<void> {
  await listen<unknown>("sidecar_recv", (e: { payload: unknown }) => {
    handleServerMessage(e.payload as ServerMessage);
  });
}