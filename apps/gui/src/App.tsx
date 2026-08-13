import { useEffect, useState } from "react";
import { initBridge, registerEventSink, request } from "./ipc/bridge";
import type { ServerMessage, StateSnapshot } from "@carl-code/shared";
import MessageList from "./components/MessageList";
import Composer from "./components/Composer";
import StatusBar from "./components/StatusBar";

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<unknown[]>([]);
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    registerEventSink((msg: ServerMessage) => {
      if (msg.type === "ready") {
        setSessionId(msg.sessionId);
      } else if (msg.type === "agent_event") {
        setEvents((prev) => [...prev, msg.event]);
      } else if (msg.type === "state") {
        setState(msg.state);
      } else if (msg.type === "fatal") {
        setBootError(msg.error);
      }
    });
    void initBridge()
      .then(async () => {
        // Let the sidecar boot; then pull an initial projection.
        const s = (await request("getState")) as StateSnapshot | null;
        setState(s);
      })
      .catch((err) => setBootError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (bootError) {
    return <div className="boot-error">Failed to start agent host: {bootError}</div>;
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">carl-code</span>
        <span className="session-id">{sessionId ? sessionId.slice(0, 8) : "connecting…"}</span>
      </header>
      <MessageList events={events} state={state} />
      <Composer />
      <StatusBar state={state} />
    </div>
  );
}