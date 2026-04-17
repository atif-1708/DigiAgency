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

      const since = (startDate as string)?.split('T')[0] || "2023-01-01";
      const until = (endDate as string)?.split('T')[0] || new Date().toISOString().split('T')[0];

      for (const store of stores || []) {
        if (!store.meta_access_token) continue;

        let shopifyOrders: any[] = [];
        if (store.shopify_domain && store.shopify_access_token) {
          try {
            const cleanDomain = store.shopify_domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
            const cleanToken = store.shopify_access_token.trim().replace(/^["']|["']$/g, "");
            const res = await axios.get(`https://${cleanDomain}/admin/api/2024-01/orders.json`, {
              headers: { "X-Shopify-Access-Token": cleanToken },
              params: { status: "any", created_at_min: new Date(since).toISOString(), limit: 250 },
              timeout: 8000
            });
            shopifyOrders = res.data.orders || [];
          } catch (e) {}
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

                let shopifyRevenue = 0, shopifyConfirmed = 0;
                const ident = matchedEmployee?.identifier?.toLowerCase();
                for (const order of shopifyOrders) {
                  const landing = (order.landing_site || "").toLowerCase();
                  if ((ident && landing.includes(ident)) || landing.includes(insight.campaign_id)) {
                    if (!order.cancelled_at) {
                      shopifyRevenue += parseFloat(order.total_price || "0");
                      shopifyConfirmed++;
                    }
                  }
                }

                allCampaigns.push({
                  id: insight.campaign_id, name: campName, spend,
                  revenue: shopifyRevenue || (spend * parseFloat(insight.purchase_roas?.[0]?.value || "0")),
                  store_name: store.name, buyer_name: matchedEmployee?.full_name || "Unassigned"
                });
              }
            } catch (e) {}
          })());
        }
      }

      await Promise.all(fetchPromises);
      performanceCache.set(cacheKey, { data: allCampaigns, timestamp: Date.now() });
      res.json({ success: true, data: allCampaigns });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}
