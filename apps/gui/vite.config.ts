import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for the Tauri webview. Needs to build with the correct base for
// Tauri's dev server and the bundled app shell.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Tauri rebuilds Rust separately; don't let Vite try to watch it.
      ignored: ["**/src-tauri/**"],
    },
  },
});