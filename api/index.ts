import { createApp } from "../server";

// Create the Express app once (API routes only)
const app = createApp();

// Export the app directly for Vercel
export default app;
