import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { target: "es2020" },
  // PORT lets a harness assign a free port when 5173 is already taken.
  server: { host: true, port: Number(process.env.PORT) || 5173 }
});
