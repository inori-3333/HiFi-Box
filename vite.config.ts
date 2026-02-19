import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function resolveBasePath(): string {
  if (!process.env.GITHUB_ACTIONS) {
    return "/";
  }
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  const repoName = repository.split("/")[1] ?? "";
  if (!repoName || repoName.endsWith(".github.io")) {
    return "/";
  }
  return `/${repoName}/`;
}

export default defineConfig({
  base: resolveBasePath(),
  plugins: [react()],
  clearScreen: false,
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"]
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true
  }
});
