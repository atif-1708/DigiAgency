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

const app = express();
app.use(express.json());

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

// Logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

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
    console.error("Meta API Error:", error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data?.error?.message || "Failed to fetch ad accounts from Meta" 
    });
  }
});

app.post("/api/admin/create-user", async (req, res) => {
  const { email, password, fullName, role, agencyId, identifier, storeId } = req.body;
  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });
    if (authError) throw authError;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ 
        role, 
        agency_id: agencyId, 
        identifier,
        store_id: storeId // Added store_id
      })
      .eq("id", authData.user.id);

    if (profileError) throw profileError;
    res.json({ success: true, user: authData.user });
  } catch (error: any) {
    console.error("Admin API Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/meta/sync-campaigns", async (req, res) => {
  const { storeId } = req.body;

  if (!storeId) {
    return res.status(400).json({ error: "Store ID is required" });
  }

  try {
    // 1. Fetch Store and its Ad Accounts
    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("*, ad_accounts(*)")
      .eq("id", storeId)
      .single();

    if (storeError || !store) throw new Error("Store not found");
    if (!store.meta_access_token) throw new Error("Meta Access Token missing for this store");

    // 2. Fetch Employees for matching
    const { data: employees } = await supabaseAdmin
      .from("profiles")
      .select("id, identifier")
      .eq("agency_id", store.agency_id);

    const results = [];

    // 3. For each Ad Account, fetch campaigns
    for (const adAccount of store.ad_accounts) {
      const response = await axios.get(
        `https://graph.facebook.com/v19.0/${adAccount.ad_account_id}/campaigns`,
        {
          params: {
            access_token: store.meta_access_token,
            fields: "name,status,start_time,insights{spend,purchase_roas,outbound_clicks}",
          },
        }
      );

      const campaigns = response.data.data || [];

      for (const camp of campaigns) {
        // Find matching employee
        const matchedEmployee = employees?.find(emp => 
          emp.identifier && camp.name.toLowerCase().includes(emp.identifier.toLowerCase())
        );

        const spend = parseFloat(camp.insights?.data?.[0]?.spend || "0");
        
        // Mocking Shopify data for now - in a real app, we'd fetch from Shopify API
        // We'll generate some semi-random revenue based on spend for the demo
        const revenue = spend * (1.5 + Math.random() * 2); 
        const orders = Math.floor(revenue / 50);

        const campaignData = {
          id: camp.id,
          ad_account_id: adAccount.id, // Use the internal UUID
          store_id: storeId,
          employee_id: matchedEmployee?.id || null,
          name: camp.name,
          spend: spend,
          revenue: revenue,
          meta_purchases: Math.floor(orders * 0.8), // Mocked
          confirmed_orders: orders,
          cancelled_orders: 0,
          pending_orders: 0,
          status: camp.status,
          start_date: camp.start_time || new Date().toISOString()
        };

        // Upsert to Supabase
        const { error: upsertError } = await supabaseAdmin
          .from("campaigns")
          .upsert(campaignData);

        if (upsertError) {
          console.error("Upsert error for campaign:", camp.name, JSON.stringify(upsertError, null, 2));
        }
        results.push(campaignData);
      }
    }

    res.json({ success: true, count: results.length });
  } catch (error: any) {
    console.error("Sync Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Catch-all for API routes
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
