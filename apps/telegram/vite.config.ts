import { defineConfig } from "vite";
export default defineConfig(({ command }) => ({
  base: "/",
  define: {
    __EDITOR_ENABLED__: JSON.stringify(
      command === "serve" ||
        process.env.CONTEXT === "deploy-preview" ||
        process.env.VITE_LEVEL_EDITOR === "1",
    ),
  },
  build: { target: "es2020" },
}));
