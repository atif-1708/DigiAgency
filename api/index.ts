import { createApp } from "../server";

// Create the Express app instance (API routes only)
const app = createApp();

// Vercel serverless handler with basic error catching
// We export a handler function to ensure we can log or catch boot errors if they happen.
export default async function handler(req: any, res: any) {
  try {
    // Standard Express apps can be passed directly as handlers in Vercel's Node runtime
    return app(req, res);
  } catch (error: any) {
    console.error("Vercel Function Error:", error);
    res.status(500).json({
      success: false,
      error: "Function Invocation Error",
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
