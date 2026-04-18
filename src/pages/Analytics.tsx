import React, { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { 
  BarChart3, 
  PieChart, 
  Filter, 
  RefreshCcw,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Award,
  Target,
  Zap,
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { formatLocalYYYYMMDD } from '@/lib/date-utils';

const CPR_RANGES = [
  { label: 'Low (<150)', min: 0, max: 150, color: '#22c55e' },
  { label: 'Mid (150-300)', min: 150, max: 300, color: '#eab308' },
  { label: 'High (>300)', min: 300, max: Infinity, color: '#ef4444' }
];

export default function Analytics() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('all-campaigns');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState('all-employees');
  const [dateRange, setDateRange] = useState('last-30-days');
  const [minRoas, setMinRoas] = useState(0);
  const [selectedCprRange, setSelectedCprRange] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('cpr-asc');
  const [currentRange, setCurrentRange] = useState({ start: new Date(), end: new Date() });

  useEffect(() => {
    if (profile?.agency_id) {
      fetchEmployees();
      fetchData();
    }
  }, [profile, dateRange]);

  async function fetchEmployees() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('agency_id', profile?.agency_id)
      .eq('role', 'employee');
    setEmployees(data || []);
  }

  async function fetchData(isRefresh = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        agencyId: profile?.agency_id || '',
      });
      
      if (isRefresh) params.append('refresh', 'true');

      let start = new Date();
      let end = new Date();
      
      if (dateRange === 'today') {
        start.setHours(0,0,0,0);
      } else if (dateRange === 'yesterday') {
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
      } else if (dateRange === 'last-7-days') {
        start.setDate(start.getDate() - 7);
      } else if (dateRange === 'last-30-days') {
        start.setDate(start.getDate() - 30);
      } else if (dateRange === 'last-60-days') {
        start.setDate(start.getDate() - 60);
      }
      
      setCurrentRange({ start, end });
      params.append('startDate', formatLocalYYYYMMDD(start));
      params.append('endDate', formatLocalYYYYMMDD(end));

      const response = await fetch(`/api/performance?${params.toString()}`);
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response (Analytics):", text);
        throw new Error(`Server returned HTML instead of data (${response.status}). This usually means the API route was not found.`);
      }

      const result = await response.json();

      if (!result.success) throw new Error(result.error);

      // Process campaigns to calculate CPR correctly
      const processed = (result.data || []).map((camp: any) => {
        const totalShopify = (camp.shopify_confirmed || 0) + (camp.shopify_pending || 0) + (camp.shopify_cancelled || 0);
        return {
          ...camp,
          cpr: camp.meta_purchases > 0 ? camp.spend / camp.meta_purchases : 0,
          roas: camp.spend > 0 ? camp.meta_revenue / camp.spend : 0,
          total_shopify: totalShopify,
          shopify_cpr: totalShopify > 0 ? camp.spend / totalShopify : 0,
          confirmed_cpr: camp.shopify_confirmed > 0 ? camp.spend / camp.shopify_confirmed : 0,
          confirmation_rate: totalShopify > 0 ? (camp.shopify_confirmed / totalShopify) * 100 : 0
        };
      });

      setCampaigns(processed);
    } catch (error: any) {
      toast.error('Failed to fetch analytics data', { description: error.message });
    } finally {
      setLoading(false);
    }
  }

  const baseFilteredCampaigns = useMemo(() => {
    let base = campaigns.filter(camp => {
      return selectedEmployee === 'all-employees' || camp.employee_id === selectedEmployee;
    });

    if (activeTab === 'new-campaigns') {
      const startStr = formatLocalYYYYMMDD(currentRange.start);
      const endStr = formatLocalYYYYMMDD(currentRange.end);
      
      base = base.filter(camp => {
        const campStart = camp.start_date?.split('T')[0];
        return campStart >= startStr && campStart <= endStr;
      });
    }

    return base;
  }, [campaigns, selectedEmployee, activeTab, currentRange]);

  const filteredCampaigns = useMemo(() => {
    let result = baseFilteredCampaigns.filter(camp => {
      const matchesRoas = camp.roas >= minRoas;
      
      let matchesCpr = true;
      if (selectedCprRange) {
        const range = CPR_RANGES.find(r => r.label === selectedCprRange);
        if (range) {
          matchesCpr = camp.cpr >= range.min && camp.cpr < range.max;
        }
      }
      
      return matchesRoas && matchesCpr;
    });

    // Handle Sorting
    return [...result].sort((a, b) => {
      if (sortBy === 'cpr-asc') return a.cpr - b.cpr;
      if (sortBy === 'roas-desc') return b.roas - a.roas;
      if (sortBy === 'orders-desc') return b.confirmed_orders - a.confirmed_orders;
      return 0;
    });
  }, [baseFilteredCampaigns, minRoas, selectedCprRange, sortBy]);

  const distributionData = useMemo(() => {
    const counts = CPR_RANGES.map(range => ({
      name: range.label,
      count: baseFilteredCampaigns.filter(c => c.cpr >= range.min && c.cpr < range.max && c.cpr > 0).length,
      color: range.color
    }));
    return counts;
  }, [baseFilteredCampaigns]);

  const bestCprCampaign = useMemo(() => {
    const withCpr = baseFilteredCampaigns.filter(c => c.cpr > 0);
    if (withCpr.length === 0) return null;
    return withCpr.reduce((prev, curr) => (prev.cpr < curr.cpr ? prev : curr));
  }, [baseFilteredCampaigns]);

  const stats = useMemo(() => {
    const totalSpend = baseFilteredCampaigns.reduce((sum, c) => sum + c.spend, 0);
    const totalMetaRevenue = baseFilteredCampaigns.reduce((sum, c) => sum + (c.meta_revenue || 0), 0);
    const totalMetaPurchases = baseFilteredCampaigns.reduce((sum, c) => sum + (c.meta_purchases || 0), 0);
    
    const totalShopify = baseFilteredCampaigns.reduce((sum, c) => sum + (c.total_shopify || 0), 0);
    const totalConfirmed = baseFilteredCampaigns.reduce((sum, c) => sum + (c.shopify_confirmed || 0), 0);
    const totalPending = baseFilteredCampaigns.reduce((sum, c) => sum + (c.shopify_pending || 0), 0);
    const totalCancelled = baseFilteredCampaigns.reduce((sum, c) => sum + (c.shopify_cancelled || 0), 0);
    
    return {
      totalCampaigns: baseFilteredCampaigns.length,
      totalSpend,
      totalRevenue: totalMetaRevenue,
      avgRoas: totalSpend > 0 ? totalMetaRevenue / totalSpend : 0,
      metaOrders: totalMetaPurchases,
      shopifyOrders: totalShopify,
      confirmed: totalConfirmed,
      pending: totalPending,
      cancelled: totalCancelled,
      confirmationRate: totalShopify > 0 ? (totalConfirmed / totalShopify) * 100 : 0,
      shopifyCpr: totalShopify > 0 ? totalSpend / totalShopify : 0,
      confirmedCpr: totalConfirmed > 0 ? totalSpend / totalConfirmed : 0,
      metaCpr: totalMetaPurchases > 0 ? totalSpend / totalMetaPurchases : 0
    };
  }, [baseFilteredCampaigns]);

  return (
    <div className="py-8 space-y-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 px-2">
        <div className="space-y-3">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-primary">Advanced Analytics</h1>
          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-2xl w-fit">
            <button 
              onClick={() => setActiveTab('all-campaigns')}
              className={cn(
                "px-6 py-2 text-[11px] font-bold uppercase tracking-widest rounded-[14px] transition-all",
                activeTab === 'all-campaigns' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground"
              )}
            >
              All Active
            </button>
            <button 
              onClick={() => setActiveTab('new-campaigns')}
              className={cn(
                "px-6 py-2 text-[11px] font-bold uppercase tracking-widest rounded-[14px] transition-all",
                activeTab === 'new-campaigns' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground"
              )}
            >
              New Campaigns
            </button>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger className="w-[200px] h-12 rounded-2xl bg-card border-none shadow-sm font-semibold px-6">
              <SelectValue>
                {selectedEmployee === 'all-employees' ? 'All Employees' : employees.find(e => e.id === selectedEmployee)?.full_name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-2xl">
              <SelectItem value="all-employees">All Employees</SelectItem>
              {employees.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px] h-12 rounded-2xl bg-card border-none shadow-sm font-semibold px-6">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-2xl">
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last-7-days">Last 7 Days</SelectItem>
              <SelectItem value="last-30-days">Last 30 Days</SelectItem>
              <SelectItem value="last-60-days">Last 60 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => fetchData(true)} disabled={loading} size="icon" className={cn("h-12 w-12 rounded-2xl shadow-lg shadow-primary/10 transition-all", loading && "bg-muted text-muted-foreground")}>
            <RefreshCcw className={cn("h-5 w-5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-5">
        <Card className="border-none shadow-md bg-card rounded-3xl group hover:shadow-xl transition-all duration-500 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-500">
                <DollarSign className="h-6 w-6" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">Spend</p>
              <h3 className="text-2xl font-extrabold tracking-tight">Rs {stats.totalSpend.toLocaleString()}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-card rounded-3xl group hover:shadow-xl transition-all duration-500 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="h-12 w-12 rounded-2xl bg-green-500/5 flex items-center justify-center text-green-600 group-hover:bg-green-600 group-hover:text-white transition-all duration-500">
                <ShoppingCart className="h-6 w-6" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">Meta Revenue</p>
              <h3 className="text-2xl font-extrabold tracking-tight text-green-600">Rs {stats.totalRevenue.toLocaleString()}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-card rounded-3xl group border-l-[6px] border-l-green-500 hover:shadow-xl transition-all duration-500 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="h-12 w-12 rounded-2xl bg-green-500/5 flex items-center justify-center text-green-600 group-hover:bg-green-600 group-hover:text-white transition-all duration-500">
                <Zap className="h-6 w-6" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">Meta ROAS</p>
              <h3 className="text-3xl font-extrabold tracking-tight text-green-600">{stats.avgRoas.toFixed(2)}x</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-card rounded-3xl group hover:shadow-xl transition-all duration-500 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="h-12 w-12 rounded-2xl bg-blue-500/5 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                <Users className="h-6 w-6" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">Meta Orders</p>
              <h3 className="text-2xl font-extrabold tracking-tight">{stats.metaOrders}</h3>
              <p className="text-[10px] mt-2 font-bold text-muted-foreground uppercase opacity-60">CPR: Rs {stats.metaCpr.toFixed(0)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-card rounded-3xl group hover:shadow-xl transition-all duration-500 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="h-12 w-12 rounded-2xl bg-orange-500/5 flex items-center justify-center text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-all duration-500">
                <Target className="h-6 w-6" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">Total Campaigns</p>
              <h3 className="text-2xl font-extrabold tracking-tight">{stats.totalCampaigns}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-md bg-card rounded-3xl group hover:shadow-xl transition-all duration-500 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-500">
                <Package className="h-6 w-6" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">Shopify Matched</p>
              <h3 className="text-2xl font-extrabold tracking-tight text-primary">{stats.shopifyOrders}</h3>
              <p className="text-[10px] mt-2 font-bold text-muted-foreground uppercase opacity-60">CPR: Rs {stats.shopifyCpr.toFixed(0)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-card rounded-3xl group border-l-[6px] border-l-primary hover:shadow-xl transition-all duration-500 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="h-12 w-12 rounded-2xl bg-green-500/5 flex items-center justify-center text-green-600 group-hover:bg-green-600 group-hover:text-white transition-all duration-500">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <Badge variant="outline" className="text-[11px] font-bold uppercase tracking-widest border-green-500/50 text-green-600 px-3 py-1 rounded-full">{stats.confirmationRate.toFixed(1)}%</Badge>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">Confirmed</p>
              <h3 className="text-2xl font-extrabold tracking-tight text-green-600">{stats.confirmed}</h3>
              <p className="text-[10px] mt-2 font-bold text-muted-foreground uppercase opacity-60">CPR: Rs {stats.confirmedCpr.toFixed(0)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-card rounded-3xl group hover:shadow-xl transition-all duration-500 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="h-12 w-12 rounded-2xl bg-amber-500/5 flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all duration-500">
                <Clock className="h-6 w-6" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">Pending</p>
              <h3 className="text-2xl font-extrabold tracking-tight text-amber-600">{stats.pending}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-card rounded-3xl group hover:shadow-xl transition-all duration-500 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="h-12 w-12 rounded-2xl bg-red-500/5 flex items-center justify-center text-red-600 group-hover:bg-red-600 group-hover:text-white transition-all duration-500">
                <XCircle className="h-6 w-6" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">Cancelled</p>
              <h3 className="text-2xl font-extrabold tracking-tight text-red-600">{stats.cancelled}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-12 lg:grid-cols-2">
        {/* CPR Distribution Chart */}
        <Card className="border-none shadow-md bg-card rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-10 pb-4">
            <CardTitle className="text-2xl font-bold tracking-tight">CPR Distribution</CardTitle>
            <CardDescription className="text-base text-muted-foreground">Number of campaigns grouped by Cost Per Result.</CardDescription>
          </CardHeader>
          <CardContent className="p-10 pt-0 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} layout="vertical" margin={{ left: 60, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.1} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  width={120} 
                  fontSize={13}
                  fontWeight={600}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-card border-none shadow-2xl rounded-2xl p-4 text-sm font-semibold">
                          <p className="text-muted-foreground uppercase tracking-widest text-[10px] mb-1">{payload[0].payload.name}</p>
                          <p className="text-lg">{payload[0].value} Campaigns</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="count" 
                  radius={[0, 12, 12, 0]} 
                  barSize={40}
                  onClick={(data) => setSelectedCprRange(selectedCprRange === data.name ? null : data.name)}
                  className="cursor-pointer"
                >
                  {distributionData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color} 
                      opacity={selectedCprRange && selectedCprRange !== entry.name ? 0.3 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-8 flex flex-wrap gap-4 text-xs justify-center">
              {CPR_RANGES.map(r => (
                <button 
                  key={r.label}
                  onClick={() => setSelectedCprRange(selectedCprRange === r.label ? null : r.label)}
                  className={cn(
                    "flex items-center gap-3 px-5 py-2.5 rounded-2xl transition-all font-bold",
                    selectedCprRange === r.label ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105" : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="tracking-wide uppercase text-[10px]">{r.label}</span>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-background/50 rounded-lg">
                    {distributionData.find(d => d.name === r.label)?.count || 0}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Best CPR Campaign / Insight */}
        <Card className="border-none shadow-xl bg-primary text-primary-foreground overflow-hidden rounded-[2.5rem] flex flex-col justify-center">
          <div className="absolute -top-12 -right-12 p-12 opacity-5 scale-150">
            <Award size={240} />
          </div>
          <CardHeader className="p-12 pb-0">
            <CardTitle className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
              <Zap className="h-8 w-8 fill-current" />
              Peak Intelligence
            </CardTitle>
            <CardDescription className="text-lg text-primary-foreground/70 font-medium">Highest efficiency segment based on lowest CPR.</CardDescription>
          </CardHeader>
          <CardContent className="p-12 pt-10">
            {bestCprCampaign ? (
              <div className="space-y-10">
                <div>
                  <h2 className="text-4xl lg:text-5xl font-black tracking-tighter leading-tight mb-4">
                    {bestCprCampaign.name}
                  </h2>
                  <Badge className="bg-white/20 hover:bg-white/30 text-white border-transparent px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest">
                    {bestCprCampaign.store_name}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-10 pt-10 border-t border-white/20">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary-foreground/50 mb-3">Efficiency (CPR)</p>
                    <p className="text-4xl font-extrabold tracking-tight">Rs {bestCprCampaign.cpr.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary-foreground/50 mb-3">Multiplier (ROAS)</p>
                    <p className="text-4xl font-extrabold tracking-tight">{bestCprCampaign.roas.toFixed(2)}x</p>
                  </div>
                </div>
                
                <p className="text-lg text-primary-foreground/80 font-medium leading-relaxed">
                  This segment is outperforming your enterprise average by <span className="text-white font-bold underline decoration-white/30 underline-offset-4">{Math.abs(((bestCprCampaign.cpr / (stats.metaCpr || 1)) - 1) * 100).toFixed(0)}%</span> in acquisition efficiency.
                </p>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center py-20 border-2 border-white/20 border-dashed rounded-[2rem]">
                <p className="text-xl font-bold text-primary-foreground/40">Analyzing data streams...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card className="border-none shadow-md bg-card rounded-[3rem] overflow-hidden h-fit">
        <CardHeader className="p-10 pb-8 border-b border-border/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-1">
              <CardTitle className="text-2xl font-bold tracking-tight flex items-center gap-3">
                <Filter className="h-7 w-7 text-primary" />
                Performance Ledger
              </CardTitle>
              <CardDescription className="text-base font-medium text-muted-foreground">Deep-dive into granular campaign performance metrics.</CardDescription>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Sort Metric</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[200px] h-11 rounded-2xl bg-muted/40 border-none font-bold text-xs">
                    <SelectValue placeholder="Sort Results" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl shadow-2xl border-none">
                    <SelectItem value="cpr-asc">CPR: Low to High</SelectItem>
                    <SelectItem value="roas-desc">ROAS: High to Low</SelectItem>
                    <SelectItem value="orders-desc">Orders: High to Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Roas Floor</span>
                <Select value={minRoas.toString()} onValueChange={(val) => setMinRoas(parseFloat(val))}>
                  <SelectTrigger className="w-[140px] h-11 rounded-2xl bg-muted/40 border-none font-bold text-xs">
                    <SelectValue placeholder="Min ROAS" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl shadow-2xl border-none">
                    <SelectItem value="0">All ROAS</SelectItem>
                    <SelectItem value="1">1.0x +</SelectItem>
                    <SelectItem value="2">2.0x +</SelectItem>
                    <SelectItem value="3">3.0x +</SelectItem>
                    <SelectItem value="4">4.0x +</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-border/50 h-16">
                <TableHead className="pl-10 font-black uppercase tracking-widest text-[10px]">Campaign Identity</TableHead>
                <TableHead className="font-black uppercase tracking-widest text-[10px]">Strategist</TableHead>
                <TableHead className="text-right font-black uppercase tracking-widest text-[10px]">Investment</TableHead>
                <TableHead className="text-right font-black uppercase tracking-widest text-[10px]">Meta CPR</TableHead>
                <TableHead className="text-right font-black uppercase tracking-widest text-[10px]">Efficiency</TableHead>
                <TableHead className="text-right font-black uppercase tracking-widest text-[10px]">Vol (Meta)</TableHead>
                <TableHead className="text-right font-black uppercase tracking-widest text-[10px] whitespace-nowrap">Shopify Segment</TableHead>
                <TableHead className="text-right font-black uppercase tracking-widest text-[10px]">Confirmed</TableHead>
                <TableHead className="text-right font-black uppercase tracking-widest text-[10px]">Pending</TableHead>
                <TableHead className="text-right font-black uppercase tracking-widest text-[10px]">Cancelled</TableHead>
                <TableHead className="text-right pr-10 font-black uppercase tracking-widest text-[10px]">Conf %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-80 text-center">
                    <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary opacity-50" />
                    <p className="mt-4 text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Filtering Data Streams...</p>
                  </TableCell>
                </TableRow>
              ) : filteredCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-80 text-center">
                    <div className="flex flex-col items-center justify-center gap-5 opacity-20">
                      <Filter className="h-16 w-16" />
                      <p className="text-2xl font-black tracking-tighter uppercase">No intelligence segments found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCampaigns.map((camp) => (
                  <TableRow key={camp.id} className="hover:bg-muted/30 border-border/50 transition-colors h-24 group">
                    <TableCell className="pl-10">
                      <div className="flex flex-col gap-1.5">
                        <span className="font-bold text-[15px] leading-none group-hover:text-primary transition-colors tracking-tight">{camp.name}</span>
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-80">{camp.store_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-muted/50 text-foreground font-black text-[10px] px-3 py-1.5 rounded-full uppercase tracking-tighter border-none">{camp.buyer_name}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-black text-[15px] tracking-tight text-primary">Rs {camp.spend.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-bold text-sm text-muted-foreground">Rs {camp.cpr.toFixed(0)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn(
                        "font-black text-sm px-4 py-1.5 rounded-xl inline-block",
                        camp.roas >= 3 ? "bg-green-500/10 text-green-600 shadow-sm shadow-green-500/5" :
                        camp.roas >= 2 ? "bg-primary/10 text-primary shadow-sm shadow-primary/5" :
                        camp.roas >= 1.2 ? "bg-amber-500/10 text-amber-600 shadow-sm shadow-amber-500/5" :
                        "bg-red-500/10 text-red-600 shadow-sm shadow-red-500/5"
                      )}>
                        {camp.roas.toFixed(2)}x
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-black text-[15px]">
                      {camp.meta_purchases || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-black text-[15px] text-primary leading-none">{camp.total_shopify}</span>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase opacity-60 tracking-widest whitespace-nowrap">Rs {camp.shopify_cpr.toFixed(0)} CPR</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-black text-[15px] text-green-600 leading-none">{camp.shopify_confirmed || 0}</span>
                        <span className="text-[9px] font-bold text-green-600/70 uppercase tracking-widest whitespace-nowrap opacity-60">Rs {camp.confirmed_cpr.toFixed(0)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-black text-[15px] text-amber-500">{camp.shopify_pending || 0}</TableCell>
                    <TableCell className="text-right font-black text-[15px] text-red-500">{camp.shopify_cancelled || 0}</TableCell>
                    <TableCell className="text-right pr-10">
                      <span className={cn(
                        "font-black text-[15px] px-3 py-1 rounded-lg",
                        camp.confirmation_rate >= 70 ? "text-green-600 bg-green-500/10" : "text-muted-foreground"
                      )}>
                        {camp.confirmation_rate.toFixed(1)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
