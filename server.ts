import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createApp } from "./src/server/app.js";

// Load environment variables for local development
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.VITE_PROD === "true" ||
    !!process.env.VERCEL;

  console.log(`[DevServer] Starting in ${isProd ? "Production" : "Development"} mode...`);

  // Create the API app instance
  const app = createApp();

  if (isProd) {
    const distPath = path.join(process.cwd(), "dist");
    console.log(`[DevServer] Serving static files from: ${distPath}`);
    app.use(express.static(distPath, { index: false }));

    app.get("*", (req, res) => {
      if (req.url.startsWith("/api/")) {
        return res.status(404).json({ error: "API route not found" });
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    // Dynamic import to keep Vite out of production builds
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("[DevServer] Vite middleware integrated.");
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[DevServer] Listening on http://0.0.0.0:${PORT}`);
  });
}

// Only run the server if we're not inside a Vercel function
if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error("[DevServer] Failed to start:", err);
  });
}
