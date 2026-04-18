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
      avgRoas: totalSpend > 0 ? totalMetaRevenue / totalSpend : 0,
      metaOrders: totalMetaPurchases,
      shopifyOrders: totalShopify,
      confirmed: totalConfirmed,
      pending: totalPending,
      cancelled: totalCancelled,
      confirmationRate: totalShopify > 0 ? (totalConfirmed / totalShopify) * 100 : 0,
      shopifyCpr: totalShopify > 0 ? totalSpend / totalShopify : 0,
      confirmedCpr: totalConfirmed > 0 ? totalSpend / totalConfirmed : 0
    };
  }, [baseFilteredCampaigns]);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Advanced Analytics</h1>
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl w-fit mt-2">
            <button 
              onClick={() => setActiveTab('all-campaigns')}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                activeTab === 'all-campaigns' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              All Active
            </button>
            <button 
              onClick={() => setActiveTab('new-campaigns')}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                activeTab === 'new-campaigns' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              New Campaigns
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger className="w-[180px] rounded-xl bg-card/50 border-none shadow-sm">
              <SelectValue>
                {selectedEmployee === 'all-employees' ? 'All Employees' : employees.find(e => e.id === selectedEmployee)?.full_name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-employees">All Employees</SelectItem>
              {employees.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px] rounded-xl bg-card/50 border-none shadow-sm">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last-7-days">Last 7 Days</SelectItem>
              <SelectItem value="last-30-days">Last 30 Days</SelectItem>
              <SelectItem value="last-60-days">Last 60 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={() => fetchData(true)} disabled={loading}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Spend</p>
                <h3 className="text-xl font-bold mt-1">Rs {stats.totalSpend.toLocaleString()}</h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm border-l-4 border-l-green-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Meta ROAS</p>
                <h3 className="text-xl font-bold mt-1 text-green-500">{stats.avgRoas.toFixed(2)}x</h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                <Zap className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Meta Orders</p>
                <h3 className="text-xl font-bold mt-1">{stats.metaOrders}</h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shopify Matched</p>
                <div className="flex flex-col">
                  <h3 className="text-xl font-bold mt-1 text-primary">{stats.shopifyOrders}</h3>
                  <span className="text-[10px] text-muted-foreground font-mono">CPR: Rs {stats.shopifyCpr.toFixed(0)}</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Package className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm border-l-4 border-l-primary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Confirmed</p>
                <div className="flex flex-col">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-xl font-bold mt-1 text-green-600">{stats.confirmed}</h3>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-green-500 text-green-600 font-bold">{stats.confirmationRate.toFixed(1)}%</Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">CPR: Rs {stats.confirmedCpr.toFixed(0)}</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending</p>
                <h3 className="text-xl font-bold mt-1 text-amber-600">{stats.pending}</h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cancelled</p>
                <h3 className="text-xl font-bold mt-1 text-red-600">{stats.cancelled}</h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-600">
                <XCircle className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* CPR Distribution Chart */}
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold">CPR Distribution</CardTitle>
            <CardDescription>Number of campaigns grouped by Cost Per Result.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.1} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  width={100} 
                  fontSize={12}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-background border rounded-lg p-2 shadow-lg text-xs">
                          <p className="font-bold">{payload[0].payload.name}</p>
                          <p className="text-muted-foreground">{payload[0].value} Campaigns</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="count" 
                  radius={[0, 4, 4, 0]} 
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
            <div className="mt-4 flex flex-wrap gap-4 text-xs justify-center">
              {CPR_RANGES.map(r => (
                <button 
                  key={r.label}
                  onClick={() => setSelectedCprRange(selectedCprRange === r.label ? null : r.label)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all text-[11px]",
                    selectedCprRange === r.label ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                  )}
                >
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                  {r.label}
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px] bg-background/50">
                    {distributionData.find(d => d.name === r.label)?.count || 0}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Best CPR Campaign / Insight */}
        <Card className="border-none shadow-sm bg-primary text-primary-foreground overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Award size={160} />
          </div>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 fill-current" />
              Best Performing Segment
            </CardTitle>
            <CardDescription className="text-primary-foreground/70">Highest value campaign based on lowest CPR.</CardDescription>
          </CardHeader>
          <CardContent className="mt-4">
            {bestCprCampaign ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-4xl font-bold tracking-tight mb-2 truncate">
                    {bestCprCampaign.name}
                  </h2>
                  <Badge variant="outline" className="bg-white/10 text-white border-white/20">
                    {bestCprCampaign.store_name}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-primary-foreground/60 mb-1">CPR</p>
                    <p className="text-2xl font-bold">Rs {bestCprCampaign.cpr.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-primary-foreground/60 mb-1">ROAS</p>
                    <p className="text-2xl font-bold">{bestCprCampaign.roas.toFixed(2)}x</p>
                  </div>
                </div>
                
                <div className="pt-2">
                  <p className="text-sm text-primary-foreground/80 italic">
                    This campaign is outperforming the agency average by {Math.abs(((bestCprCampaign.cpr / stats.avgCpr) - 1) * 100).toFixed(0)}% lower CPR.
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center py-12 border-2 border-white/10 border-dashed rounded-xl">
                <p className="text-primary-foreground/50">No data available to analyze</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              Campaign Segment Analysis
            </CardTitle>
            
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1">Sort By</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[180px] rounded-xl bg-background/50 text-xs">
                    <SelectValue placeholder="Sort Results" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpr-asc">CPR: Low to High</SelectItem>
                    <SelectItem value="roas-desc">ROAS: High to Low</SelectItem>
                    <SelectItem value="orders-desc">Orders: High to Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1">Min ROAS</span>
                <Select value={minRoas.toString()} onValueChange={(val) => setMinRoas(parseFloat(val))}>
                  <SelectTrigger className="w-[120px] rounded-xl bg-background/50">
                    <SelectValue placeholder="Min ROAS" />
                  </SelectTrigger>
                  <SelectContent>
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
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-muted">
                <TableHead className="pl-6">Campaign</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right text-muted-foreground font-normal">Meta CPR</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">Meta Orders</TableHead>
                <TableHead className="text-right text-primary font-bold">Shopify Orders</TableHead>
                <TableHead className="text-right text-green-600">Confirmed</TableHead>
                <TableHead className="text-right text-amber-600">Pending</TableHead>
                <TableHead className="text-right text-red-600">Cancelled</TableHead>
                <TableHead className="text-right pr-6">Conf %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-64 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : filteredCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-64 text-center text-muted-foreground italic">
                    No campaigns match the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCampaigns.map((camp) => (
                  <TableRow key={camp.id} className="hover:bg-accent/30 border-muted transition-colors">
                    <TableCell className="pl-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm tracking-tight">{camp.name}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">{camp.store_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal text-[9px] uppercase tracking-tight py-0">
                        {camp.buyer_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[10px]">Rs {camp.spend.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground text-[10px]">Rs {camp.cpr.toFixed(0)}</TableCell>
                    <TableCell className="text-right">
                      <div className={cn(
                        "font-bold text-xs",
                        camp.roas >= 2 ? "text-green-500" : camp.roas >= 1.2 ? "text-amber-500" : "text-destructive"
                      )}>
                        {camp.roas.toFixed(2)}x
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-muted-foreground text-xs">{camp.meta_purchases || 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-primary text-xs">{camp.total_shopify}</span>
                        <span className="text-[9px] text-primary/70 font-mono">CPR: Rs {camp.shopify_cpr.toFixed(0)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-green-600 text-xs">{camp.shopify_confirmed || 0}</span>
                        <span className="text-[9px] text-green-600/70 font-mono">CPR: Rs {camp.confirmed_cpr.toFixed(0)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-amber-500 font-bold text-xs">{camp.shopify_pending || 0}</TableCell>
                    <TableCell className="text-right text-red-500 font-bold text-xs">{camp.shopify_cancelled || 0}</TableCell>
                    <TableCell className="text-right font-bold text-[10px] pr-6">
                      {camp.confirmation_rate.toFixed(1)}%
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
