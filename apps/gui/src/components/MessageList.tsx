import { useEffect, useRef } from "react";
import type { StateSnapshot } from "@carl-code/shared";

interface Props {
  events: unknown[];
  state: StateSnapshot | null;
}

export default function MessageList({ events, state }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length, state?.messages.length]);

  const messages = state?.messages ?? [];
  const toolEvents = events.filter(
    (e) => (e as { type?: string }).type === "tool_execution_start" || (e as { type?: string }).type === "tool_execution_update" || (e as { type?: string }).type === "tool_execution_end",
  );

  return (
    <div className="message-list">
      {messages.map((m, i) => (
        <MessageView key={i} msg={m} />
      ))}
      {toolEvents.length > 0 && (
        <div className="tool-events">
          {toolEvents.map((e, i) => (
            <ToolEventView key={i} event={e} />
          ))}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

function MessageView({ msg }: { msg: unknown }) {
  const m = msg as { role?: string; content?: unknown; text?: unknown };
  const text = typeof m.text === "string" ? m.text : typeof m.content === "string" ? m.content : "";
  const className = `message message-${m.role ?? "unknown"}`;
  if (!text && m.role) {
    return (
      <div className={className}>
        <em>(non-text {m.role} message)</em>
      </div>
    );
  }
  return <div className={className}>{text}</div>;
}

function ToolEventView({ event }: { event: unknown }) {
  const e = event as { type?: string; toolName?: string; isError?: boolean; stoppedText?: string };
  return (
    <div className={`tool-event ${e.isError ? "tool-error" : ""}`}>
      <span className="tool-name">{e.toolName ?? e.type}</span>
      {e.stoppedText && <span className="tool-text">{e.stoppedText}</span>}
    </div>
  );
}