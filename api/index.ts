import { createApp } from "../src/server/app.js";

// Initialize the Express app factory (API routes only)
const app = createApp();

// Export as a Vercel serverless function
// Vercel bridges Express's (req, res) signature automatically.
export default app;
