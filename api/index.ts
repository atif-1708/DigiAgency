import { createApp } from "../server";

// Create the Express app once (API routes only — no Vite, no listen)
const app = createApp();

// Vercel serverless handler
// Vercel routes every /api/* request to this file.
// The URL still contains the /api prefix, so we strip it before handing
// off to Express so that apiRouter sees e.g. "/performance" not "/api/performance".
export default function handler(req: any, res: any) {
  if (req.url && req.url.startsWith("/api")) {
    req.url = req.url.replace(/^\/api/, "") || "/";
  }
  return app(req, res);
}