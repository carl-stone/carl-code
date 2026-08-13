import type { StateSnapshot } from "@carl-code/shared";

interface Props {
  state: StateSnapshot | null;
}

export default function StatusBar({ state }: Props) {
  return (
    <footer className="status-bar">
      <span>{state?.model ?? "no model"}</span>
      <span>{state?.isStreaming ? "● streaming" : "idle"}</span>
      <span className="status-spacer" />
      <span>{state ? `${state.messages.length} msgs` : ""}</span>
    </footer>
  );
}