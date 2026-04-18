import express from "express";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";

// ─── syncStoreCampaigns helper ──────────────────────────────────────────────
async function syncStoreCampaigns(storeId: string, supabaseAdmin: any) {
  const { data: store, error: storeError } = await supabaseAdmin
    .from("stores")
    .select("*, ad_accounts(*)")
    .eq("id", storeId)
    .single();

  if (storeError || !store) throw new Error("Store not found");
  if (!store.meta_access_token)
    throw new Error("Meta Access Token missing for this store");

  const { data: employees } = await supabaseAdmin
    .from("profiles")
    .select("id, identifier")
    .eq("agency_id", store.agency_id);

  const results = [];

  for (const adAccount of store.ad_accounts) {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/v19.0/${adAccount.ad_account_id}/campaigns`,
        {
          params: {
            access_token: store.meta_access_token,
            fields:
              "name,status,start_time,insights{spend,purchase_roas,outbound_clicks}",
          },
        }
      );

      const campaigns = response.data.data || [];

      for (const camp of campaigns) {
        const matchedEmployee = employees?.find(
          (emp: any) =>
            emp.identifier &&
            camp.name.toLowerCase().includes(emp.identifier.toLowerCase())
        );

        const spend = parseFloat(
          camp.insights?.data?.[0]?.spend || "0"
        );
        const metaPurchases = parseInt(
          camp.insights?.data?.[0]?.actions?.find(
            (a: any) => a.action_type === "purchase"
          )?.value || "0"
        );

        let shopifyConfirmed = 0;
        let shopifyPending = 0;
        let shopifyCancelled = 0;
        let shopifyRevenue = 0;

        if (store.shopify_domain && store.shopify_access_token) {
          try {
            const cleanDomain = store.shopify_domain
              .trim()
              .replace(/^https?:\/\//, "")
              .replace(/\/$/, "");
            const cleanToken = store.shopify_access_token
              .trim()
              .replace(/^["']|["']$/g, "");

            let shopifyRes;
            try {
              shopifyRes = await axios.get(
                `https://${cleanDomain}/admin/api/2024-01/orders.json`,
                {
                  headers: { "X-Shopify-Access-Token": cleanToken },
                  params: {
                    status: "any",
                    created_at_min:
                      camp.start_time ||
                      new Date(
                        Date.now() - 7 * 24 * 60 * 60 * 1000
                      ).toISOString(),
                  },
                }
              );
            } catch (e: any) {
              if (!cleanDomain.includes(".myshopify.com")) {
                const fallback = `${cleanDomain.split(".")[0]}.myshopify.com`;
                shopifyRes = await axios.get(
                  `https://${fallback}/admin/api/2024-01/orders.json`,
                  {
                    headers: { "X-Shopify-Access-Token": cleanToken },
                    params: {
                      status: "any",
                      created_at_min:
                        camp.start_time ||
                        new Date(
                          Date.now() - 7 * 24 * 60 * 60 * 1000
                        ).toISOString(),
                    },
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
              const isMatch =
                (identifier && landingSite.includes(identifier)) ||
                landingSite.includes(camp.id) ||
                landingSite.includes(
                  camp.name.toLowerCase().replace(/\s+/g, "_")
                );

              if (isMatch) {
                const totalPrice = parseFloat(order.total_price || "0");
                if (order.cancelled_at) {
                  shopifyCancelled++;
                } else if (order.fulfillment_status === "fulfilled") {
                  shopifyConfirmed++;
                  shopifyRevenue += totalPrice;
                } else {
                  shopifyPending++;
                  shopifyRevenue += totalPrice;
                }
              }
            }
          } catch (shError: any) {
            console.error(
              `Shopify Sync Error for ${store.name}:`,
              shError.message
            );
          }
        }

        let startDateStr = new Date().toISOString();
        if (camp.start_time) {
          const d = new Date(camp.start_time);
          if (!isNaN(d.getTime())) startDateStr = d.toISOString();
        }

        const campaignData = {
          id: String(camp.id),
          ad_account_id: adAccount.id,
          store_id: storeId,
          employee_id: matchedEmployee?.id || null,
          name: camp.name || "Untitled Campaign",
          spend: isNaN(spend) ? 0 : spend,
          revenue: shopifyRevenue,
          meta_purchases: metaPurchases || Math.floor(shopifyConfirmed * 0.8),
          confirmed_orders: shopifyConfirmed,
          cancelled_orders: shopifyCancelled,
          pending_orders: shopifyPending,
          status: camp.status || "UNKNOWN",
          start_date: startDateStr,
        };

        const { error: upsertError } = await supabaseAdmin
          .from("campaigns")
          .upsert(campaignData, { onConflict: "id" });

        if (upsertError) {
          console.error(
            `!!! UPSERT ERROR for "${camp.name}": ${upsertError.message}`
          );
          if (
            upsertError.code === "22P02" ||
            upsertError.message.includes("invalid input syntax for type uuid")
          ) {
            const fallbackData = {
              ...campaignData,
              ad_account_id: adAccount.ad_account_id,
            };
            const { error: fallbackError } = await supabaseAdmin
              .from("campaigns")
              .upsert(fallbackData, { onConflict: "id" });
            if (fallbackError) {
              console.error(
                `!!! FALLBACK ERROR for "${camp.name}": ${fallbackError.message}`
              );
            }
          }
        }
        results.push(campaignData);
      }
    } catch (err: any) {
      console.error(
        `Failed to sync ad account ${adAccount.ad_account_id}:`,
        err.message
      );
    }
  }
  return results;
}

// ─── createApp Factory ─────────────────────────────────────────────────────
export function createApp() {
  const app = express();
  app.use(express.json());

  // Helper to get Supabase Admin Client lazily
  let supabaseAdminClient: any = null;
  const getSupabaseAdmin = () => {
    if (!supabaseAdminClient) {
      const url = process.env.VITE_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!url || !key) {
        console.error("[CRITICAL] Missing Supabase environment variables.");
        return null;
      }
      
      supabaseAdminClient = createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
    return supabaseAdminClient;
  };

  const apiRouter = express.Router();

  apiRouter.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - [API] ${req.method} ${req.url}`);
    next();
  });

  app.use("/api", apiRouter);

  // ── Health check ──
  apiRouter.get("/health", (req, res) => {
    res.json({
      status: "ok",
      vercel: !!process.env.VERCEL,
      supabase: !!process.env.VITE_SUPABASE_URL ? 'configured' : 'missing'
    });
  });

  // ── Debug / Diagnostics ──
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
      originalUrl: req.originalUrl,
    });
  });

  // ── Admin: Create User ──────────────────────────────────────────────────────
  apiRouter.post("/admin/create-user", async (req, res) => {
    const { email, password, fullName, role, agencyId, identifier, storeId } = req.body;
    try {
      const supabaseAdmin = getSupabaseAdmin();
      if (!supabaseAdmin) throw new Error("Supabase not configured");

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (authError) throw authError;

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ role, agency_id: agencyId, identifier, store_id: storeId })
        .eq("id", authData.user.id);

      if (profileError) throw profileError;
      res.json({ success: true, user: authData.user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Admin: Update User ──────────────────────────────────────────────────────
  apiRouter.post("/admin/update-user", async (req, res) => {
    const { userId, email, password, fullName, role, identifier, storeId } = req.body;
    try {
      const supabaseAdmin = getSupabaseAdmin();
      if (!supabaseAdmin) throw new Error("Supabase not configured");

      const updateData: any = {};
      if (email) updateData.email = email;
      if (password) updateData.password = password;
      if (fullName) updateData.user_metadata = { full_name: fullName };

      if (Object.keys(updateData).length > 0) {
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, updateData);
        if (authError) throw authError;
      }

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ 
          full_name: fullName,
          role: role,
          identifier: identifier,
          store_id: storeId 
        })
        .eq("id", userId);

      if (profileError) throw profileError;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Admin: Delete User ──────────────────────────────────────────────────────
  apiRouter.post("/admin/delete-user", async (req, res) => {
    const { userId } = req.body;
    try {
      const supabaseAdmin = getSupabaseAdmin();
      if (!supabaseAdmin) throw new Error("Supabase not configured");

      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authError) throw authError;

      // Profiles usually cascade, but let's be explicit
      await supabaseAdmin.from("profiles").delete().eq("id", userId);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Meta: Sync Campaigns (single store) ────────────────────────────────────
  apiRouter.post("/meta/sync-campaigns", async (req, res) => {
    const { storeId } = req.body;
    if (!storeId) return res.status(400).json({ error: "Store ID is required" });
    try {
      const supabaseAdmin = getSupabaseAdmin();
      if (!supabaseAdmin) throw new Error("Supabase not configured");
      const syncResult = await syncStoreCampaigns(storeId, supabaseAdmin);
      res.json({ success: true, count: syncResult.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Meta: Sync Agency (all stores) ─────────────────────────────────────────
  apiRouter.post("/meta/sync-agency", async (req, res) => {
    const { agencyId } = req.body;
    if (!agencyId) return res.status(400).json({ error: "Agency ID is required" });
    try {
      const supabaseAdmin = getSupabaseAdmin();
      if (!supabaseAdmin) throw new Error("Supabase not configured");
      const { data: stores, error: storesError } = await supabaseAdmin
        .from("stores")
        .select("id")
        .eq("agency_id", agencyId);

      if (storesError) throw storesError;

      const results = [];
      for (const store of stores || []) {
        try {
          const storeResult = await syncStoreCampaigns(store.id, supabaseAdmin);
          results.push({ storeId: store.id, success: true, count: storeResult.length });
        } catch (err: any) {
          results.push({ storeId: store.id, success: false, error: err.message });
        }
      }
      res.json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Shopify Connection Verification ──
  apiRouter.get("/shopify/verify-direct", async (req, res) => {
    const { agencyId, startDate, endDate } = req.query;
    if (!agencyId) return res.status(400).json({ error: "Agency ID is required" });

    try {
      const supabaseAdmin = getSupabaseAdmin();
      if (!supabaseAdmin) throw new Error("Supabase not configured");

      const { data: stores, error: storesError } = await supabaseAdmin
        .from("stores")
        .select("*")
        .eq("agency_id", agencyId);

      if (storesError) throw storesError;

      const results = [];
      for (const store of stores || []) {
        if (!store.shopify_domain || !store.shopify_access_token) {
          results.push({ storeName: store.name, status: "Missing Credentials" });
          continue;
        }

        const cleanDomain = store.shopify_domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
        const cleanToken = store.shopify_access_token.trim().replace(/^["']|["']$/g, "");
        const maskedToken = cleanToken ? `${cleanToken.substring(0, 6)}...${cleanToken.substring(cleanToken.length - 4)}` : "None";
        const since = (startDate as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const testConnection = async (domain: string) => {
          try {
            // Test 1: Basic Shop Info (Tests Token Validity)
            const shopRes = await axios.get(`https://${domain}/admin/api/2024-04/shop.json`, {
              headers: { "X-Shopify-Access-Token": cleanToken, "Accept": "application/json" },
              timeout: 10000
            });
            
            // Test 2: Orders (Tests Scopes/Permissions)
            let orders: any[] = [];
            let ordersError = null;
            try {
              const ordersRes = await axios.get(`https://${domain}/admin/api/2024-04/orders.json`, {
                headers: { "X-Shopify-Access-Token": cleanToken, "Accept": "application/json" },
                params: { status: "any", created_at_min: since, limit: 50 },
                timeout: 10000
              });
              orders = ordersRes.data.orders || [];
            } catch (oe: any) {
              ordersError = oe.response?.data?.errors || oe.message;
            }

            return { success: true, shop: shopRes.data.shop, orders, ordersError, domainUsed: domain };
          } catch (err: any) {
            return { success: false, error: err.response?.data?.errors || err.message, status: err.response?.status, domainUsed: domain };
          }
        };

        // Try primary domain, fallback to .myshopify.com if it looks like a custom domain
        let testResult = await testConnection(cleanDomain);
        if (!testResult.success && !cleanDomain.includes(".myshopify.com")) {
          const fallback = `${cleanDomain.split(".")[0]}.myshopify.com`;
          const fallbackResult = await testConnection(fallback);
          if (fallbackResult.success) testResult = fallbackResult;
        }

        if (testResult.success) {
          results.push({
            storeName: store.name,
            status: "Connected",
            shopConnectivity: "Success",
            ordersConnectivity: testResult.ordersError ? `Failed: ${testResult.ordersError}` : "Success",
            orderCount: testResult.orders?.length || 0,
            totalSales: testResult.orders?.reduce((sum: number, o: any) => sum + parseFloat(o.total_price || "0"), 0).toFixed(2),
            currency: testResult.shop?.currency || "USD",
            maskedToken,
            domainUsed: testResult.domainUsed,
            isScopeIssue: !!testResult.ordersError
          });
        } else {
          results.push({
            storeName: store.name,
            status: "Error",
            statusLine: testResult.status ? `HTTP ${testResult.status}` : "Network Error",
            error: testResult.error,
            maskedToken,
            hint: testResult.status === 401 ? "Unauthorized. Token is invalid or App is not installed." : "Check domain or permissions.",
            domainUsed: testResult.domainUsed
          });
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Shopify test ──
  apiRouter.post("/shopify/test", async (req, res) => {
    const { domain, token } = req.body;
    if (!domain || !token) return res.status(400).json({ error: "Domain and Token are required" });

    try {
      const cleanDomain = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
      const cleanToken = token.trim().replace(/^["']|["']$/g, "");

      const shopifyResponse = await axios.get(
        `https://${cleanDomain}/admin/api/2024-01/shop.json`,
        {
          headers: { "X-Shopify-Access-Token": cleanToken, "Content-Type": "application/json" },
          timeout: 10000,
        }
      );
      res.json({ success: true, shop: shopifyResponse.data.shop });
    } catch (error: any) {
      res.status(error.response?.status || 500).json({ error: error.message });
    }
  });

  // ── Meta Ad Accounts ──
  apiRouter.post("/meta/ad-accounts", async (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: "Access token is required" });

    try {
      const metaResponse = await axios.get(
        `https://graph.facebook.com/v19.0/me/adaccounts`,
        { params: { access_token: accessToken, fields: "name,account_id,id,currency,timezone_name" } }
      );
      res.json({ success: true, data: metaResponse.data.data });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Performance API ──
  const performanceCache = new Map<string, { data: any; timestamp: number }>();
  const CACHE_TTL = 5 * 60 * 1000;

  apiRouter.get("/performance", async (req, res) => {
    const { agencyId, employeeId, storeId, startDate, endDate, refresh } = req.query;
    if (!agencyId) return res.status(400).json({ error: "Agency ID is required" });

    const cacheKey = JSON.stringify({ agencyId, employeeId, storeId, startDate, endDate });
    const cachedData = performanceCache.get(cacheKey);
    if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL && refresh !== "true") {
      return res.json({ success: true, data: cachedData.data, fromCache: true });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      if (!supabaseAdmin) throw new Error("Supabase not configured");
      
      let storesQuery = supabaseAdmin.from("stores").select("*, ad_accounts(*)").eq("agency_id", agencyId);
      if (storeId && storeId !== "all-stores") storesQuery = storesQuery.eq("id", storeId);

      const { data: stores, error: storesError } = await storesQuery;
      if (storesError) throw storesError;

      const { data: employees } = await supabaseAdmin.from("profiles").select("id, full_name, identifier").eq("agency_id", agencyId);

      const allCampaigns: any[] = [];
      const fetchPromises: Promise<void>[] = [];
      let totalOrdersFetched = 0;
      const storeErrors: any[] = [];

      const since = (startDate as string)?.split('T')[0] || "2023-01-01";
      const until = (endDate as string)?.split('T')[0] || new Date().toISOString().split('T')[0];

      for (const store of stores || []) {
        if (!store.meta_access_token) continue;

        let shopifyOrders: any[] = [];
        if (store.shopify_domain && store.shopify_access_token) {
          try {
            const cleanDomain = store.shopify_domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
            const cleanToken = store.shopify_access_token.trim().replace(/^["']|["']$/g, "");
            
            const startDateBuffered = new Date(since);
            startDateBuffered.setDate(startDateBuffered.getDate() - 3); // 3 days buffer for safety
            const shopifySince = startDateBuffered.toISOString();

            let allStoreOrders: any[] = [];
            let nextPageUrl: string | null = `https://${cleanDomain}/admin/api/2024-04/orders.json?status=any&created_at_min=${shopifySince}&limit=250`;
            let pagesFetched = 0;

            // Fetch all pages for the requested date range (Safety limit of 50 pages/12.5k orders)
            while (nextPageUrl && pagesFetched < 50) {
              const res = await axios.get(nextPageUrl, {
                headers: { "X-Shopify-Access-Token": cleanToken, "Accept": "application/json" },
                timeout: 30000 // 30s timeout per page request
              });
              
              const pageOrders = res.data.orders || [];
              allStoreOrders = [...allStoreOrders, ...pageOrders];
              pagesFetched++;

              const linkHeader = res.headers['link'];
              nextPageUrl = null;
              if (linkHeader) {
                const matches = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
                if (matches) nextPageUrl = matches[1];
              }
              
              if (pageOrders.length < 250) break;
            }
            
            shopifyOrders = allStoreOrders;
            totalOrdersFetched += shopifyOrders.length;
            console.log(`[Performance API] ${store.name}: Fetched ALL orders in range (${shopifyOrders.length} orders, ${pagesFetched} pages).`);
          } catch (e: any) {
            const status = e.response?.status;
            let msg = e.message;
            if (status === 401) {
              msg = "Invalid Shopify Access Token (401). Please ensure you are using the 'Admin API access token' (shpat_...) and NOT the API key/secret.";
            }
            storeErrors.push({ store: store.name, error: msg, status });
          }
        }

        for (const adAccount of store.ad_accounts) {
          fetchPromises.push((async () => {
            try {
              let actId = adAccount.ad_account_id;
              if (!actId.startsWith("act_")) actId = `act_${actId}`;

              const [cRes, iRes] = await Promise.all([
                axios.get(`https://graph.facebook.com/v19.0/${actId}/campaigns`, { params: { access_token: store.meta_access_token, fields: "name,status,start_time", limit: 1000 } }),
                axios.get(`https://graph.facebook.com/v19.0/${actId}/insights`, { params: { access_token: store.meta_access_token, level: "campaign", fields: "campaign_id,spend,purchase_roas,actions", time_range: JSON.stringify({ since, until }) } })
              ]);

              const campaigns = cRes.data.data || [];
              const insights = iRes.data.data || [];

              for (const insight of insights) {
                const spend = parseFloat(insight.spend || "0");
                if (spend <= 0) continue;

                const camp = campaigns.find((c: any) => c.id === insight.campaign_id);
                const campName = camp?.name || "Unknown";
                const matchedEmployee = employees?.find(emp => emp.identifier && campName.toLowerCase().includes(emp.identifier.toLowerCase()));

                if (employeeId && matchedEmployee?.id !== employeeId) continue;

                let shopifyRevenue = 0, shopifyConfirmed = 0, shopifyPending = 0, shopifyCancelled = 0;
                const ident = matchedEmployee?.identifier?.toLowerCase();
                const campIdStr = String(insight.campaign_id);

                for (const order of shopifyOrders) {
                  // Ensure order date matches the filtered range
                  const orderDateStr = order.created_at.split('T')[0];
                  if (orderDateStr < since || orderDateStr > until) continue;

                  const landing = (order.landing_site || "").toLowerCase();
                  const referring = (order.referring_site || "").toLowerCase();
                  const note = (order.note || "").toLowerCase();
                  const tags = (order.tags || "").toLowerCase();
                  
                  // Extract note_attributes values as a string
                  const noteAttrsStr = (order.note_attributes || [])
                    .map((attr: any) => `${attr.name}:${attr.value}`)
                    .join(" ")
                    .toLowerCase();
                  
                  // Check various sources for a match
                  const isIdMatch = landing.includes(campIdStr) || 
                                   referring.includes(campIdStr) || 
                                   note.includes(campIdStr) || 
                                   tags.includes(campIdStr) ||
                                   noteAttrsStr.includes(campIdStr);

                  const isNameMatch = campName !== "Unknown" && (
                    landing.includes(campName.toLowerCase().replace(/\s+/g, "_")) || 
                    landing.includes(campName.toLowerCase().replace(/\s+/g, "-")) ||
                    tags.includes(campName.toLowerCase()) ||
                    noteAttrsStr.includes(campName.toLowerCase())
                  );
                  
                  const isIdentMatch = ident && (
                    landing.includes(ident) || 
                    tags.includes(ident) || 
                    note.includes(ident) ||
                    noteAttrsStr.includes(ident)
                  );

                  if (isIdMatch || isNameMatch || isIdentMatch) {
                    const totalPrice = parseFloat(order.total_price || "0");
                    if (order.cancelled_at) {
                      shopifyCancelled++;
                    } else if (order.fulfillment_status === "fulfilled") {
                      shopifyConfirmed++;
                      shopifyRevenue += totalPrice;
                    } else {
                      shopifyPending++;
                      shopifyRevenue += totalPrice;
                    }
                  }
                }

                const metaRoas = parseFloat(insight.purchase_roas?.[0]?.value || "0");
                const metaRevenue = spend * metaRoas;
                const metaPurchases = parseInt(
                  insight.actions?.find((a: any) => a.action_type === "purchase")?.value || "0"
                );

                // No fallback here, just provide raw values for both
                allCampaigns.push({
                  id: insight.campaign_id,
                  name: campName,
                  status: camp?.status || "UNKNOWN",
                  start_date: camp?.start_time || since,
                  spend,
                  // Primary fields kept as Meta for stability across other screens
                  revenue: metaRevenue,
                  confirmed_orders: metaPurchases,
                  
                  // Specific Shopify match fields
                  shopify_revenue: shopifyRevenue,
                  shopify_confirmed: shopifyConfirmed,
                  shopify_pending: shopifyPending,
                  shopify_cancelled: shopifyCancelled,
                  
                  // Raw Meta fields
                  meta_revenue: metaRevenue,
                  meta_purchases: metaPurchases,
                  
                  store_name: store.name,
                  buyer_name: matchedEmployee?.full_name || "Unassigned",
                  employee_id: matchedEmployee?.id || null,
                  store_id: store.id,
                  is_shopify_matched: (shopifyConfirmed + shopifyPending + shopifyCancelled) > 0
                });
              }
            } catch (e) {}
          })());
        }
      }

      await Promise.all(fetchPromises);
      performanceCache.set(cacheKey, { data: allCampaigns, timestamp: Date.now() });
      res.json({ 
        success: true, 
        data: allCampaigns,
        _debug: { 
          orders_fetched: totalOrdersFetched, 
          time_range: { since, until },
          store_errors: storeErrors
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}
