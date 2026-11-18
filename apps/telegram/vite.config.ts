import { defineConfig } from "vite";
export default defineConfig(({ command }) => ({
  base: "/",
  define: {
    __EDITOR_ENABLED__: JSON.stringify(
      true,
    ),
  },
  build: { target: "es2020" },
}));
