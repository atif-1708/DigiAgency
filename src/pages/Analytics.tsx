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
  const [selectedEmployee, setSelectedEmployee] = useState(profile?.role === 'employee' ? profile.id : 'all-employees');
  const [dateRange, setDateRange] = useState('last-30-days');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [minRoas, setMinRoas] = useState(0);
  const [selectedCprRange, setSelectedCprRange] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('cpr-asc');
  const [currentRange, setCurrentRange] = useState({ start: new Date(), end: new Date() });

  useEffect(() => {
    if (profile?.agency_id) {
      fetchEmployees();
      fetchData();
    }
  }, [profile, dateRange, customDates.start, customDates.end]);

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
      
      if (profile?.role === 'employee') {
        params.append('employeeId', profile.id);
      }
      
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
      } else if (dateRange === 'custom' && customDates.start && customDates.end) {
        start = new Date(customDates.start);
        end = new Date(customDates.end);
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
      if (selectedEmployee === 'all-employees') return true;
      if (selectedEmployee === 'unassigned') return !camp.employee_id;
      return camp.employee_id === selectedEmployee;
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
    <div className="py-6 space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-primary">Advanced Analytics</h1>
          <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl w-fit">
            <button 
              onClick={() => setActiveTab('all-campaigns')}
              className={cn(
                "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                activeTab === 'all-campaigns' ? "bg-primary text-primary-foreground shadow-md shadow-primary/10" : "text-muted-foreground hover:text-foreground"
              )}
            >
              All Active
            </button>
            <button 
              onClick={() => setActiveTab('new-campaigns')}
              className={cn(
                "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                activeTab === 'new-campaigns' ? "bg-primary text-primary-foreground shadow-md shadow-primary/10" : "text-muted-foreground hover:text-foreground"
              )}
            >
              New Campaigns
            </button>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {profile?.role !== 'employee' && (
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="w-[180px] h-10 rounded-xl bg-card border-none shadow-sm font-bold text-xs px-4">
                <SelectValue>
                  {selectedEmployee === 'all-employees' ? 'All Employees' : 
                   selectedEmployee === 'unassigned' ? 'Unassigned' : 
                   employees.find(e => e.id === selectedEmployee)?.full_name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-none shadow-2xl">
                <SelectItem value="all-employees">All Employees</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 px-3 h-10 rounded-xl bg-card border-none shadow-sm">
              <input 
                type="date" 
                className="bg-transparent border-none text-[10px] font-bold uppercase tracking-widest outline-none w-28" 
                value={customDates.start}
                onChange={(e) => setCustomDates(prev => ({ ...prev, start: e.target.value }))}
              />
              <span className="text-[10px] opacity-30 px-1 font-bold">TO</span>
              <input 
                type="date" 
                className="bg-transparent border-none text-[10px] font-bold uppercase tracking-widest outline-none w-28" 
                value={customDates.end}
                onChange={(e) => setCustomDates(prev => ({ ...prev, end: e.target.value }))}
              />
            </div>
          )}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[160px] h-10 rounded-xl bg-card border-none shadow-sm font-bold text-xs px-4">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-none shadow-2xl">
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last-7-days">Last 7 Days</SelectItem>
              <SelectItem value="last-30-days">Last 30 Days</SelectItem>
              <SelectItem value="last-60-days">Last 60 Days</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => fetchData(true)} disabled={loading} size="icon" className={cn("h-10 w-10 rounded-xl shadow-md transition-all", loading && "bg-muted text-muted-foreground")}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card className="border-none shadow-sm bg-card rounded-2xl group hover:shadow-md transition-all duration-500 overflow-hidden">
          <CardContent className="p-6">
            <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary mb-4">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Spend</p>
              <h3 className="text-xl font-black tracking-tight">Rs {stats.totalSpend.toLocaleString()}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-card rounded-2xl group hover:shadow-md transition-all duration-500 overflow-hidden">
          <CardContent className="p-6">
            <div className="h-10 w-10 rounded-xl bg-green-500/5 flex items-center justify-center text-green-600 mb-4">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Meta Revenue</p>
              <h3 className="text-xl font-black tracking-tight text-green-600">Rs {stats.totalRevenue.toLocaleString()}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-card rounded-2xl group border-l-4 border-l-green-500 hover:shadow-md transition-all duration-500 overflow-hidden">
          <CardContent className="p-6">
            <div className="h-10 w-10 rounded-xl bg-green-500/5 flex items-center justify-center text-green-600 mb-4">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Meta ROAS</p>
              <h3 className="text-xl font-black tracking-tight text-green-600">{stats.avgRoas.toFixed(2)}x</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-card rounded-2xl group hover:shadow-md transition-all duration-500 overflow-hidden">
          <CardContent className="p-6">
            <div className="h-10 w-10 rounded-xl bg-blue-500/5 flex items-center justify-center text-blue-600 mb-4">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Meta Orders</p>
              <h3 className="text-xl font-black tracking-tight">{stats.metaOrders}</h3>
              <p className="text-[8px] mt-1 font-bold text-blue-600 dark:text-blue-400 uppercase opacity-60">CPR: Rs {stats.metaCpr.toFixed(0)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-card rounded-2xl group hover:shadow-md transition-all duration-500 overflow-hidden">
          <CardContent className="p-6">
            <div className="h-10 w-10 rounded-xl bg-orange-500/5 flex items-center justify-center text-orange-600 mb-4">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total Campaigns</p>
              <h3 className="text-xl font-black tracking-tight">{stats.totalCampaigns}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-sm bg-card rounded-2xl group hover:shadow-md transition-all duration-500 overflow-hidden">
          <CardContent className="p-6">
            <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary mb-4">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Shopify Matched</p>
              <h3 className="text-xl font-black tracking-tight text-primary">{stats.shopifyOrders}</h3>
              <p className="text-[8px] mt-1 font-bold text-blue-600 dark:text-blue-400 uppercase opacity-60">CPR: Rs {stats.shopifyCpr.toFixed(0)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-card rounded-2xl group border-l-4 border-l-primary hover:shadow-md transition-all duration-500 overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="h-10 w-10 rounded-xl bg-green-500/5 flex items-center justify-center text-green-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest border-green-500/30 text-green-600 px-2 py-0.5 rounded-full">{stats.confirmationRate.toFixed(1)}%</Badge>
            </div>
            <div>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Confirmed</p>
              <h3 className="text-xl font-black tracking-tight text-green-600">{stats.confirmed}</h3>
              <p className="text-[8px] mt-1 font-bold text-blue-600 dark:text-blue-400 uppercase opacity-60">CPR: Rs {stats.confirmedCpr.toFixed(0)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-card rounded-2xl group hover:shadow-md transition-all duration-500 overflow-hidden">
          <CardContent className="p-6">
            <div className="h-10 w-10 rounded-xl bg-amber-500/5 flex items-center justify-center text-amber-600 mb-4">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Pending</p>
              <h3 className="text-xl font-black tracking-tight text-amber-600">{stats.pending}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-card rounded-2xl group hover:shadow-md transition-all duration-500 overflow-hidden">
          <CardContent className="p-6">
            <div className="h-10 w-10 rounded-xl bg-red-500/5 flex items-center justify-center text-red-600 mb-4">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Cancelled</p>
              <h3 className="text-xl font-black tracking-tight text-red-600">{stats.cancelled}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* CPR Distribution Chart */}
        <Card className="border-none shadow-sm bg-card rounded-2xl overflow-hidden">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-lg font-bold tracking-tight">CPR Distribution</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Campaigns grouped by Cost Per Result.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} layout="vertical" margin={{ left: 40, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.1} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  width={100} 
                  fontSize={11}
                  fontWeight={600}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-card border shadow-xl rounded-xl p-3 text-xs font-bold">
                          <p className="text-muted-foreground uppercase tracking-widest text-[8px] mb-1">{payload[0].payload.name}</p>
                          <p className="text-sm">{payload[0].value} Campaigns</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="count" 
                  radius={[0, 8, 8, 0]} 
                  barSize={30}
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
            <div className="mt-4 flex flex-wrap gap-2 text-xs justify-center">
              {CPR_RANGES.map(r => (
                <button 
                  key={r.label}
                  onClick={() => setSelectedCprRange(selectedCprRange === r.label ? null : r.label)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all font-bold",
                    selectedCprRange === r.label ? "bg-primary text-primary-foreground shadow-md" : "bg-muted hover:bg-muted/80"
                  )}
                >
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="tracking-wide uppercase text-[8px]">{r.label}</span>
                  <Badge variant="secondary" className="h-4 px-1 text-[8px] bg-background/50 rounded">
                    {distributionData.find(d => d.name === r.label)?.count || 0}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Peak Intelligence Showcase */}
        <Card className="border-none shadow-sm bg-primary text-primary-foreground overflow-hidden rounded-2xl flex flex-col justify-center">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <Award size={120} />
          </div>
          <CardHeader className="p-8 pb-0">
            <CardTitle className="flex items-center gap-2 text-xl font-black tracking-tight">
              <Zap className="h-6 w-6 fill-current" />
              Peak Intelligence
            </CardTitle>
            <CardDescription className="text-xs text-primary-foreground/70 font-bold uppercase tracking-widest">Top Acquisition Efficiency</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-6">
            {bestCprCampaign ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-black tracking-tight leading-tight mb-2">
                    {bestCprCampaign.name}
                  </h2>
                  <Badge className="bg-white/10 text-white border-transparent px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest">
                    {bestCprCampaign.store_name}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/10">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-primary-foreground/50 mb-1">Efficiency (CPR)</p>
                    <p className="text-2xl font-black tracking-tight">Rs {bestCprCampaign.cpr.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-primary-foreground/50 mb-1">Multiplier (ROAS)</p>
                    <p className="text-2xl font-black tracking-tight">{bestCprCampaign.roas.toFixed(2)}x</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center py-10 border border-white/10 border-dashed rounded-xl">
                <p className="text-sm font-bold text-primary-foreground/30 uppercase tracking-widest">Analyzing data stream...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card className="border-none shadow-sm bg-card rounded-2xl overflow-hidden h-fit">
        <CardHeader className="p-6 pb-4 border-b border-border/5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-0.5">
              <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
                <Filter className="h-5 w-5 text-primary" />
                Performance Ledger
              </CardTitle>
              <CardDescription className="text-xs font-bold text-muted-foreground uppercase opacity-70 tracking-widest">Metrics & Campaigns</CardDescription>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground px-1">Sort</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[160px] h-8 rounded-lg bg-muted/40 border-none font-bold text-[10px]">
                    <SelectValue placeholder="Sort Results" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-2xl border-none">
                    <SelectItem value="cpr-asc">CPR: Low to High</SelectItem>
                    <SelectItem value="roas-desc">ROAS: High to Low</SelectItem>
                    <SelectItem value="orders-desc">Orders: High to Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground px-1">Roas Floor</span>
                <Select value={minRoas.toString()} onValueChange={(val) => setMinRoas(parseFloat(val))}>
                  <SelectTrigger className="w-[100px] h-8 rounded-lg bg-muted/40 border-none font-bold text-[10px]">
                    <SelectValue placeholder="Min ROAS" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-2xl border-none">
                    <SelectItem value="0">All ROAS</SelectItem>
                    <SelectItem value="1">1.0x +</SelectItem>
                    <SelectItem value="2">2.0x +</SelectItem>
                    <SelectItem value="3">3.0x +</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow className="hover:bg-transparent border-border/10 h-10">
                <TableHead className="pl-6 font-bold uppercase tracking-widest text-[9px] w-[250px]">Campaign Identity</TableHead>
                <TableHead className="font-bold uppercase tracking-widest text-[9px]">Strategist</TableHead>
                <TableHead className="text-right font-bold uppercase tracking-widest text-[9px]">Ad Spend</TableHead>
                <TableHead className="text-right font-bold uppercase tracking-widest text-[9px]">Meta CPR</TableHead>
                <TableHead className="text-right font-bold uppercase tracking-widest text-[9px]">ROAS</TableHead>
                <TableHead className="text-right font-bold uppercase tracking-widest text-[9px]">Purchases</TableHead>
                <TableHead className="text-right font-bold uppercase tracking-widest text-[9px] whitespace-nowrap">Shopify Orders</TableHead>
                <TableHead className="text-right font-bold uppercase tracking-widest text-[9px]">Confirmed</TableHead>
                <TableHead className="text-right font-bold uppercase tracking-widest text-[9px]">Pending</TableHead>
                <TableHead className="text-right font-bold uppercase tracking-widest text-[9px]">Cancelled</TableHead>
                <TableHead className="text-right pr-6 font-bold uppercase tracking-widest text-[9px]">Conf %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-40 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-30" />
                  </TableCell>
                </TableRow>
              ) : filteredCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-40 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 opacity-20">
                      <Filter className="h-10 w-10" />
                      <p className="text-sm font-bold tracking-tighter uppercase">No intelligence segments found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCampaigns.map((camp) => (
                  <TableRow key={camp.id} className="hover:bg-muted/20 border-border/5 transition-colors h-14 group">
                    <TableCell className="pl-6">
                      <div className="flex flex-col">
                        <span className="font-bold text-xs leading-none group-hover:text-primary transition-colors tracking-tight">{camp.name}</span>
                        <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest opacity-60 mt-1">{camp.store_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-muted/50 text-foreground font-bold text-[9px] px-2 py-0.5 rounded-md uppercase border-none">{camp.buyer_name}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-bold text-xs text-primary">Rs {camp.spend.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-xs text-blue-600 dark:text-blue-400">Rs {camp.cpr.toFixed(0)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn(
                        "font-black text-[10px] px-2 py-0.5 rounded-lg inline-block",
                        camp.roas >= 3 ? "bg-green-500/10 text-green-600" :
                        camp.roas >= 2 ? "bg-primary/10 text-primary" :
                        camp.roas >= 1.2 ? "bg-amber-500/10 text-amber-600" :
                        "bg-red-500/10 text-red-600"
                      )}>
                        {camp.roas.toFixed(2)}x
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs">
                      {camp.meta_purchases || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-xs text-primary leading-none">{camp.total_shopify}</span>
                        <span className="text-[8px] font-bold text-blue-600 dark:text-blue-400 uppercase opacity-60 mt-0.5 whitespace-nowrap">Rs {camp.shopify_cpr.toFixed(0)} CPR</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-xs text-green-600 leading-none">{camp.shopify_confirmed || 0}</span>
                        <span className="text-[8px] font-bold text-blue-600 dark:text-blue-400 uppercase opacity-60 mt-0.5 whitespace-nowrap">Rs {camp.confirmed_cpr.toFixed(0)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs text-amber-500">{camp.shopify_pending || 0}</TableCell>
                    <TableCell className="text-right font-bold text-xs text-red-500">{camp.shopify_cancelled || 0}</TableCell>
                    <TableCell className="text-right pr-6">
                      <span className="font-black text-xs">{camp.confirmation_rate.toFixed(0)}%</span>
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
