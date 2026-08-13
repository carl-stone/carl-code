// Starter extension for the carl-code harness.
//
// This is a tiny example to verify your package is wired up correctly.
// It registers a `/carl` command and a `carl_hello` tool. Replace it (or add
// more .ts files / folders next to it) with the real behavior you want.
//
// Each .ts file here must export a default factory that receives the pi API.
// Extensions in a package's `extensions/` dir are auto-discovered on load.
//
// See: docs/extensions.md for the full extension API.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("carl", {
    description: "Say hello from the carl-code harness",
    handler: async (args, ctx) => {
      ctx.ui.notify(`carl-code loaded! ${args ? `(${args})` : ""}`, "info");
    },
  });

  pi.registerTool({
    name: "carl_hello",
    label: "carl hello",
    description: "Confirm the carl-code harness is active",
    parameters: Type.Object({}),
    async execute() {
      return {
        content: [{ type: "text", text: "carl-code harness is active." }],
        details: {},
      };
    },
  });
}
