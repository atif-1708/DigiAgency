import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase Admin Client
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const app = express();
app.use(express.json());

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Fetch Meta Ad Accounts
app.post("/api/meta/ad-accounts", async (req, res) => {
  const { accessToken } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: "Access token is required" });
  }

  try {
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts`,
      {
        params: {
          access_token: accessToken,
          fields: "name,account_id,id,currency,timezone_name",
        },
      }
    );

    res.json({ success: true, data: response.data.data });
  } catch (error: any) {
    console.error("Error fetching Meta ad accounts:", error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data?.error?.message || "Failed to fetch ad accounts from Meta" 
    });
  }
});

// Direct User Creation API (Admin only)
app.post("/api/admin/create-user", async (req, res) => {
  const { email, password, fullName, role, agencyId, identifier } = req.body;

  try {
    // 1. Create Auth User
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (authError) throw authError;

    // 2. Profile is created automatically by DB trigger, but we might need to update role/agency
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        role,
        agency_id: agencyId,
        identifier
      })
      .eq("id", authData.user.id);

    if (profileError) throw profileError;

    res.json({ success: true, user: authData.user });
  } catch (error: any) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: error.message });
  }
});

async function setupVite() {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

// For local development
if (!process.env.VERCEL) {
  const PORT = 3000;
  setupVite().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  });
} else {
  // On Vercel, we still need to serve static files if it's not an API call
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  // Note: Vercel routes will handle the fallback usually, but this is a safety net
}

export default app;
