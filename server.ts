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

export const app = express();
app.use(express.json());

// Logger - Moved to top for visibility on all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  res.on('finish', () => {
    console.log(`${new Date().toISOString()} - [Response] ${res.statusCode} for ${req.method} ${req.url}`);
  });
  next();
});

const apiRouter = express.Router();

// Router-level logging middleware
apiRouter.use((req, res, next) => {
  console.log(`[apiRouter] Match attempt: ${req.method} ${req.url}`);
  next();
});

app.use("/api", apiRouter);

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

// Health check
apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), platform: process.env.VERCEL ? 'vercel' : 'run' });
});

// Debug / Diagnostics
apiRouter.get("/debug", (req, res) => {
  res.json({
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      HAS_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
      HAS_SUPABASE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    headers: req.headers,
    url: req.url,
    originalUrl: req.originalUrl
  });
});

apiRouter.post("/shopify/test", async (req, res) => {
  const { domain, token } = req.body;
  if (!domain || !token) {
    return res.status(400).json({ error: "Domain and Token are required" });
  }

  try {
    const cleanDomain = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const cleanToken = token.trim().replace(/^["']|["']$/g, '');
    
    // We try a simple Shop query to verify the token
    const shopifyResponse = await axios.get(
      `https://${cleanDomain}/admin/api/2024-01/shop.json`,
      {
        headers: { 
          'X-Shopify-Access-Token': cleanToken,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    res.json({ success: true, shop: shopifyResponse.data.shop });
  } catch (error: any) {
    const status = error.response?.status;
    let msg = error.response?.data?.errors || error.message;
    if (status === 401) {
      msg = "Invalid Shopify Access Token (401). Please ensure you are using the 'Admin API access token' (shpat_...) and NOT the API key/secret.";
    }
    res.status(status || 500).json({ error: msg });
  }
});

apiRouter.post("/meta/ad-accounts", async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) {
    return res.status(400).json({ error: "Access token is required" });
  }

  try {
    const metaResponse = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts`,
      {
        params: {
          access_token: accessToken,
          fields: "name,account_id,id,currency,timezone_name",
        },
      }
    );
    res.json({ success: true, data: metaResponse.data.data });
  } catch (error: any) {
    console.error("Meta API Error:", error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data?.error?.message || "Failed to fetch ad accounts from Meta" 
    });
  }
});

apiRouter.post("/admin/create-user", async (req, res) => {
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

apiRouter.post("/meta/sync-campaigns", async (req, res) => {
  const { storeId } = req.body;

  if (!storeId) {
    return res.status(400).json({ error: "Store ID is required" });
  }

  try {
    const syncResult = await syncStoreCampaigns(storeId);
    res.json({ success: true, count: syncResult.length });
  } catch (error: any) {
    console.error("Sync Error:", error);
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/meta/sync-agency", async (req, res) => {
  const { agencyId } = req.body;

  if (!agencyId) {
    return res.status(400).json({ error: "Agency ID is required" });
  }

  try {
    const { data: stores, error: storesError } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("agency_id", agencyId);

    if (storesError) throw storesError;

    const results = [];
    for (const store of (stores || [])) {
      try {
        const storeResult = await syncStoreCampaigns(store.id);
        results.push({ storeId: store.id, success: true, count: storeResult.length });
      } catch (err: any) {
        results.push({ storeId: store.id, success: false, error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (error: any) {
    console.error("Agency Sync Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Simple in-memory cache for performance data
const performanceCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

apiRouter.get("/performance", async (req, res) => {
  const { agencyId, employeeId, storeId, startDate, endDate, refresh } = req.query;

  console.log(`[Performance API] Request: Agency=${agencyId}, Store=${storeId}, Emp=${employeeId}, Start=${startDate}, End=${endDate}, Refresh=${refresh}`);

  if (!agencyId) {
    return res.status(400).json({ error: "Agency ID is required" });
  }

  // Cache key based on all query params except 'refresh'
  const cacheParams = { ...req.query };
  delete cacheParams.refresh;
  const cacheKey = JSON.stringify(cacheParams);
  
  const cachedData = performanceCache.get(cacheKey);
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL && refresh !== 'true') {
    console.log(`[Performance API] Returning cached data for ${agencyId}`);
    return res.json({ success: true, data: cachedData.data, fromCache: true });
  }

  // ... (Rest of performance API logic - I'll keep it integrated)

  // Meta expects YYYY-MM-DD. If we get ISO strings, we extract the date part.
  // If we get YYYY-MM-DD directly, we use it.
  const formatMetaDate = (dateStr: any) => {
    if (!dateStr) return null;
    if (dateStr.includes('T')) return dateStr.split('T')[0];
    return dateStr;
  };

  const since = formatMetaDate(startDate) || '2023-01-01'; // Use far date for All Time
  const until = formatMetaDate(endDate) || new Date().toISOString().split('T')[0];
  
  const timeRange = { since, until };

  console.log(`[Performance API] Calculated Meta Time Range: ${since} to ${until}`);

  try {
    let storesQuery = supabaseAdmin
      .from("stores")
      .select("*, ad_accounts(*)")
      .eq("agency_id", agencyId);
    
    if (storeId && storeId !== 'all-stores') {
      storesQuery = storesQuery.eq("id", storeId);
    }

    const { data: stores, error: storesError } = await storesQuery;
    if (storesError) {
      console.error("[Performance API] Supabase Stores Error:", storesError);
      throw storesError;
    }

    const { data: employees } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, identifier")
      .eq("agency_id", agencyId);

    const allCampaigns: any[] = [];
    const fetchPromises: Promise<void>[] = [];

    for (const store of (stores || [])) {
      if (!store.meta_access_token) continue;

      // --- Shopify Sync for this store ---
      let shopifyOrders: any[] = [];
      if (store.shopify_domain && store.shopify_access_token) {
        try {
          // Normalize domain: remove https:// and any trailing slashes
          let cleanDomain = store.shopify_domain
            .trim()
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '');
            
          // Clean token (remove quotes/whitespace that might come from copy-paste)
          const cleanToken = store.shopify_access_token.trim().replace(/^["']|["']$/g, '');
            
          const shopifySince = new Date(since).toISOString();
          console.log(`[Performance API] Attempting Shopify Sync for ${store.name} (${cleanDomain}) since ${shopifySince}`);
          
          let shopifyRes;
          try {
            shopifyRes = await axios.get(
              `https://${cleanDomain}/admin/api/2024-01/orders.json`,
              {
                headers: { 
                  'X-Shopify-Access-Token': cleanToken,
                  'Content-Type': 'application/json'
                },
                params: { status: 'any', created_at_min: shopifySince, limit: 250 },
                timeout: 8000 // 8 second timeout
              }
            );
          } catch (firstErr: any) {
            // If failed with 401 or not found, try .myshopify.com fallback
            if ((firstErr.response?.status === 401 || firstErr.code === 'ENOTFOUND') && !cleanDomain.includes('.myshopify.com')) {
              console.log(`[Performance API] Primary domain ${cleanDomain} failed, trying .myshopify.com fallback...`);
              const storeName = cleanDomain.split('.')[0];
              const fallbackDomain = `${storeName}.myshopify.com`;
              
              shopifyRes = await axios.get(
                `https://${fallbackDomain}/admin/api/2024-01/orders.json`,
                {
                  headers: { 
                    'X-Shopify-Access-Token': cleanToken,
                    'Content-Type': 'application/json'
                  },
                  params: { status: 'any', created_at_min: shopifySince, limit: 250 },
                  timeout: 8000 // 8 second timeout
                }
              );
              console.log(`[Performance API] Fallback sync successful with ${fallbackDomain}`);
            } else {
              throw firstErr;
            }
          }
          
          shopifyOrders = shopifyRes?.data?.orders || [];
          console.log(`[Performance API] Successfully fetched ${shopifyOrders.length} orders from Shopify for ${store.name}`);
        } catch (err: any) {
          const status = err.response?.status;
          const msg = err.response?.data?.errors || err.message;
          console.error(`[Performance API] Shopify Error [${status}] for ${store.name}:`, msg);
          
          if (status === 401) {
            console.error(`[CRITICAL] Invalid Shopify Token for "${store.name}". Ensure it is the "Admin API Access Token" (shpat_...).`);
          }
        }
      }

      for (const adAccount of store.ad_accounts) {
        const fetchPromise = (async () => {
          try {
            let actId = adAccount.ad_account_id;
            if (!actId.startsWith('act_')) actId = `act_${actId}`;

            console.log(`[Performance API] Fetching Meta data for ${actId} (${store.name})`);

            // 1. Fetch campaigns (to get status and name)
            const campaignsPromise = axios.get(
              `https://graph.facebook.com/v19.0/${actId}/campaigns`,
              {
                params: {
                  access_token: store.meta_access_token,
                  fields: "name,status,start_time",
                  limit: 1000
                },
                timeout: 8000 // 8 second timeout
              }
            );

            // 2. Fetch insights for the same period
            const insightsPromise = axios.get(
              `https://graph.facebook.com/v19.0/${actId}/insights`,
              {
                params: {
                  access_token: store.meta_access_token,
                  level: 'campaign',
                  fields: "campaign_id,spend,purchase_roas,actions",
                  time_range: JSON.stringify(timeRange),
                },
                timeout: 8000 // 8 second timeout
              }
            );

            const [campaignsRes, insightsRes] = await Promise.all([campaignsPromise, insightsPromise]);
            
            const campaigns = campaignsRes.data.data || [];
            const insights = insightsRes.data.data || [];
            
            for (const insight of insights) {
              const spend = parseFloat(insight.spend || "0");
              if (spend <= 0) continue;

              const camp = campaigns.find((c: any) => c.id === insight.campaign_id);
              const campName = camp?.name || insight.campaign_name || "Unknown Campaign";
              const campStatus = camp?.status || "UNKNOWN";

              const matchedEmployee = employees?.find(emp => 
                emp.identifier && campName.toLowerCase().includes(emp.identifier.toLowerCase())
              );

              if (employeeId && matchedEmployee?.id !== employeeId) continue;

              // --- Shopify Matching Logic for this insight ---
              let shopifyConfirmed = 0;
              let shopifyPending = 0;
              let shopifyCancelled = 0;
              let shopifyRevenue = 0;

              if (shopifyOrders.length > 0) {
                const identifier = matchedEmployee?.identifier?.toLowerCase();
                for (const order of shopifyOrders) {
                  const landingSite = (order.landing_site || "").toLowerCase();
                  
                  const isMatch = (identifier && landingSite.includes(identifier)) || 
                                 landingSite.includes(insight.campaign_id) || 
                                 landingSite.includes(campName.toLowerCase().replace(/\s+/g, '_'));

                  if (isMatch) {
                    const totalPrice = parseFloat(order.total_price || "0");
                    if (order.cancelled_at) {
                      shopifyCancelled++;
                    } else if (order.fulfillment_status === 'fulfilled') {
                      shopifyConfirmed++;
                      shopifyRevenue += totalPrice;
                    } else {
                      shopifyPending++;
                      shopifyRevenue += totalPrice; 
                    }
                  }
                }
              }

              const metaRoas = parseFloat(insight.purchase_roas?.[0]?.value || "0");
              const metaRevenue = spend * metaRoas;
              const metaPurchases = parseInt(insight.actions?.find((a: any) => a.action_type === 'purchase')?.value || "0");

              allCampaigns.push({
                id: insight.campaign_id,
                name: campName,
                status: campStatus,
                start_date: camp?.start_time || timeRange.since,
                spend,
                revenue: shopifyRevenue > 0 ? shopifyRevenue : metaRevenue,
                confirmed_orders: shopifyConfirmed > 0 ? shopifyConfirmed : metaPurchases,
                cancelled_orders: shopifyCancelled,
                pending_orders: shopifyPending,
                meta_revenue: metaRevenue,
                meta_purchases: metaPurchases,
                store_name: store.name,
                buyer_name: matchedEmployee?.full_name || "Unassigned",
                employee_id: matchedEmployee?.id || null,
                store_id: store.id
              });
            }
          } catch (err: any) {
            console.error(`[Performance API] Meta API Error for ${adAccount.ad_account_id}:`, err.response?.data || err.message);
          }
        })();
        fetchPromises.push(fetchPromise);
      }
    }

    await Promise.all(fetchPromises);
    allCampaigns.sort((a, b) => b.spend - a.spend);
    performanceCache.set(cacheKey, { data: allCampaigns, timestamp: Date.now() });

    res.json({ success: true, data: allCampaigns });
  } catch (error: any) {
    console.error("[Performance API] Global Error:", error);
    res.status(500).json({ error: error.message });
  }
});

async function syncStoreCampaigns(storeId: string) {
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
    try {
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
        const metaPurchases = parseInt(camp.insights?.data?.[0]?.actions?.find((a: any) => a.action_type === 'purchase')?.value || "0");

        // --- Shopify Integration Logic ---
        let shopifyConfirmed = 0;
        let shopifyPending = 0;
        let shopifyCancelled = 0;
        let shopifyRevenue = 0;

        if (store.shopify_domain && store.shopify_access_token) {
          try {
            const cleanDomain = store.shopify_domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
            const cleanToken = store.shopify_access_token.trim().replace(/^["']|["']$/g, '');
            
            // Try fetching orders
            let shopifyRes;
            try {
              shopifyRes = await axios.get(
                `https://${cleanDomain}/admin/api/2024-01/orders.json`,
                {
                  headers: { 'X-Shopify-Access-Token': cleanToken },
                  params: {
                    status: 'any',
                    created_at_min: camp.start_time || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
                  }
                }
              );
            } catch (e: any) {
              if (!cleanDomain.includes('.myshopify.com')) {
                const fallback = `${cleanDomain.split('.')[0]}.myshopify.com`;
                shopifyRes = await axios.get(
                  `https://${fallback}/admin/api/2024-01/orders.json`,
                  {
                    headers: { 'X-Shopify-Access-Token': cleanToken },
                    params: {
                      status: 'any',
                      created_at_min: camp.start_time || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
                    }
                  }
                );
              } else {
                throw e;
              }
            }

            const orders = shopifyRes?.data?.orders || [];
            const identifier = matchedEmployee?.identifier?.toLowerCase();

            for (const order of orders) {
              const landingSite = (order.landing_site || "").toLowerCase();
              const isMatch = (identifier && landingSite.includes(identifier)) || 
                             landingSite.includes(camp.id) || 
                             landingSite.includes(camp.name.toLowerCase().replace(/\s+/g, '_'));

              if (isMatch) {
                const totalPrice = parseFloat(order.total_price || "0");
                if (order.cancelled_at) {
                  shopifyCancelled++;
                } else if (order.fulfillment_status === 'fulfilled') {
                  shopifyConfirmed++;
                  shopifyRevenue += totalPrice;
                } else {
                  shopifyPending++;
                  shopifyRevenue += totalPrice; 
                }
              }
            }
          } catch (shError: any) {
            console.error(`Shopify Sync Error for ${store.name}:`, shError.message);
            // Fallback to meta data/random for mock logic if needed, 
            // but for real sync we'll stick to 0 if Shopify fails
          }
        }

        // Ensure date is valid
        let startDateStr = new Date().toISOString();
        if (camp.start_time) {
          const d = new Date(camp.start_time);
          if (!isNaN(d.getTime())) {
            startDateStr = d.toISOString();
          }
        }

        const campaignData = {
          id: String(camp.id),
          ad_account_id: adAccount.id, // Use the internal UUID (id) from ad_accounts table
          store_id: storeId,
          employee_id: matchedEmployee?.id || null, // Link to matched employee
          name: camp.name || 'Untitled Campaign',
          spend: isNaN(spend) ? 0 : spend,
          revenue: shopifyRevenue,
          meta_purchases: metaPurchases || Math.floor(shopifyConfirmed * 0.8),
          confirmed_orders: shopifyConfirmed,
          cancelled_orders: shopifyCancelled,
          pending_orders: shopifyPending,
          status: camp.status || 'UNKNOWN',
          start_date: startDateStr
        };

        // Upsert to Supabase
        const { error: upsertError } = await supabaseAdmin
          .from("campaigns")
          .upsert(campaignData, { onConflict: 'id' });

        if (upsertError) {
          console.error(`!!! UPSERT ERROR for "${camp.name}": ${upsertError.message} (Code: ${upsertError.code})`);
          
          // Fallback: Try with Meta ID string if UUID failed (common schema mismatch)
          if (upsertError.code === '22P02' || upsertError.message.includes('invalid input syntax for type uuid')) {
            const fallbackData = { ...campaignData, ad_account_id: adAccount.ad_account_id };
            const { error: fallbackError } = await supabaseAdmin
              .from("campaigns")
              .upsert(fallbackData, { onConflict: 'id' });
            
            if (fallbackError) {
              console.error(`!!! FALLBACK ERROR for "${camp.name}": ${fallbackError.message}`);
            } else {
              console.log(`Successfully upserted "${camp.name}" using fallback Meta ID.`);
            }
          }
        }
        results.push(campaignData);
      }
    } catch (err: any) {
      console.error(`Failed to sync ad account ${adAccount.ad_account_id}:`, err.message);
    }
  }
  return results;
}

// Router-level catch-all (nested under /api)
apiRouter.all("*", (req, res) => {
  console.warn(`[apiRouter] Route not found inside router: ${req.method} ${req.url}`);
  res.status(404).json({ 
    success: false, 
    error: `API route not found inside apiRouter: ${req.method} ${req.url}`,
    help: "Available routes: /health, /debug, /performance, /shopify/test, /meta/ad-accounts, /admin/create-user, /meta/sync-campaigns, /meta/sync-agency"
  });
});

// Catch-all for API routes (if router didn't handle it at root app level)
app.all("/api/*", (req, res) => {
  console.warn(`[app] API Route Fallthrough: ${req.method} ${req.url}`);
  res.status(404).json({ error: `API route not found (app level): ${req.method} ${req.path}` });
});

// Start the server
async function startServer() {
  const isProd = process.env.NODE_ENV === "production" || process.env.VITE_PROD === "true";
  
  if (isProd) {
    const distPath = path.join(process.cwd(), "dist");
    console.log(`[Server] Production Mode: Serving static files from ${distPath}`);
    app.use(express.static(distPath, { index: false })); // Don't auto-serve index.html for everything
    
    // SPA fallback
    app.get("*", (req, res) => {
      // Very defensive check for API routes
      if (req.url.startsWith('/api/') || req.path.startsWith('/api/')) {
        console.warn(`[Server] API Route Fallthrough Detected: ${req.method} ${req.url}`);
        return res.status(404).json({ 
          success: false, 
          error: `API route not found on server: ${req.method} ${req.url}` 
        });
      }
      
      console.log(`[Server] Serving SPA fallback for: ${req.url}`);
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

const PORT = process.env.PORT || 3000;
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`[Server] listening on 0.0.0.0:${PORT}`);
    console.log(`[Server] Mode: ${isProd ? 'Production' : 'Development'}`);
    console.log(`[Server] API Router mounted at /api`);
  });
}

// Only start the server if we're not running as a Vercel serverless function
if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'test') {
  startServer().catch(err => {
    console.error("Failed to start server:", err);
  });
}
