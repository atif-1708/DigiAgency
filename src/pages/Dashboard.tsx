import React, { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { 
  DollarSign, 
  ShoppingCart, 
  TrendingUp, 
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Package,
  Loader2,
  RefreshCcw,
  CheckCircle2,
  Clock,
  XCircle,
  Target,
  Zap,
  Award
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatLocalYYYYMMDD } from '@/lib/date-utils';

const StatCard = ({ title, value, change, trend, icon: Icon, suffix = "", description }: any) => (
  <Card className="overflow-hidden border-none shadow-sm bg-card hover:shadow-md hover:scale-[1.01] transition-all duration-300 rounded-2xl group">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-500">
          <Icon className="h-5 w-5" />
        </div>
        {change !== undefined && (
          <Badge variant={trend === 'up' ? 'default' : 'destructive'} className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider">
            {trend === 'up' ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
            {change}%
          </Badge>
        )}
      </div>
      <div className="mt-4">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
        <h3 className="text-xl font-black mt-1 tracking-tight">
          {suffix}{typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value}
        </h3>
        {description && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="h-1 w-1 rounded-full bg-primary/30" />
            <div className="text-[10px] text-muted-foreground font-bold tracking-wide uppercase opacity-70">{description}</div>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    totalSpend: 0,
    totalRevenue: 0,
    avgRoas: 0,
    totalOrders: 0, // Meta Orders
    shopifyOrders: 0,
    confirmedOrders: 0,
    pendingOrders: 0,
    cancelledOrders: 0,
    avgCpr: 0,
    confirmationRate: 0,
    shopifyCpr: 0,
    confirmedCpr: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [storePerformance, setStorePerformance] = useState<any[]>([]);
  const [employeePerformance, setEmployeePerformance] = useState<any[]>([]);
  const [employeeSortBy, setEmployeeSortBy] = useState('rank-desc');
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [dateRange, setDateRange] = useState('last-30-days');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [agencyEmployeeCount, setAgencyEmployeeCount] = useState(0);

  useEffect(() => {
    if (profile?.agency_id) {
      fetchStats();
      if (profile.role === 'employee') {
        fetchAgencyEmployeeCount();
      }
    }
  }, [profile, dateRange, customDates.start, customDates.end]);

  async function fetchAgencyEmployeeCount() {
    try {
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('agency_id', profile?.agency_id)
        .eq('role', 'employee');
      
      if (!error && count !== null) {
        setAgencyEmployeeCount(count);
      }
    } catch (e) {
      console.error('Error fetching agency employee count:', e);
    }
  }

  async function fetchStats(isRefresh = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        agencyId: profile?.agency_id || '',
      });
      
      if (isRefresh) {
        params.append('refresh', 'true');
      }

      if (profile?.role === 'employee' && profile.store_id) {
        // Fetch whole store for ranking if employee
        params.append('storeId', profile.store_id);
      } else if (profile?.role === 'employee') {
        params.append('employeeId', profile.id);
      }

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

      params.append('startDate', formatLocalYYYYMMDD(start));
      params.append('endDate', formatLocalYYYYMMDD(end));

      const response = await fetch(`/api/performance?${params.toString()}`);
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response received:", text);
        throw new Error(`Server returned structure mismatch (${response.status}). If this persists, please contact support.`);
      }

      const result = await response.json();

      if (!result.success) throw new Error(result.error);

      const campaigns = result.data || [];

      if (campaigns.length === 0) {
        setHasData(false);
      } else {
        setHasData(true);
        
        // If employee, we filter the top-level stats to only their campaigns
        const displayCampaigns = profile?.role === 'employee' 
          ? campaigns.filter((c: any) => c.employee_id === profile.id)
          : campaigns;

        const totalSpend = displayCampaigns.reduce((acc: number, c: any) => acc + (c.spend || 0), 0);
        const totalMetaRevenue = displayCampaigns.reduce((acc: number, c: any) => acc + (c.meta_revenue || 0), 0);
        const totalMetaPurchases = displayCampaigns.reduce((acc: number, c: any) => acc + (c.meta_purchases || 0), 0);
        
        const shopifyOrders = displayCampaigns.reduce((acc: number, c: any) => acc + (c.shopify_confirmed || 0) + (c.shopify_pending || 0) + (c.shopify_cancelled || 0), 0);
        const confirmedOrders = displayCampaigns.reduce((acc: number, c: any) => acc + (c.shopify_confirmed || 0), 0);
        const pendingOrders = displayCampaigns.reduce((acc: number, c: any) => acc + (c.shopify_pending || 0), 0);
        const cancelledOrders = displayCampaigns.reduce((acc: number, c: any) => acc + (c.shopify_cancelled || 0), 0);
        
        const avgRoas = totalSpend > 0 ? totalMetaRevenue / totalSpend : 0;
        
        setStats({
          totalSpend,
          totalRevenue: totalMetaRevenue,
          avgRoas,
          totalOrders: totalMetaPurchases,
          shopifyOrders,
          confirmedOrders,
          pendingOrders,
          cancelledOrders,
          confirmationRate: shopifyOrders > 0 ? (confirmedOrders / shopifyOrders) * 100 : 0,
          shopifyCpr: shopifyOrders > 0 ? totalSpend / shopifyOrders : 0,
          confirmedCpr: confirmedOrders > 0 ? totalSpend / confirmedOrders : 0,
          avgCpr: totalMetaPurchases > 0 ? totalSpend / totalMetaPurchases : 0
        });

        // Group by date for chart (simplified)
        const grouped = displayCampaigns.reduce((acc: any, c: any) => {
          const date = new Date(c.start_date || new Date()).toLocaleDateString('en-US', { weekday: 'short' });
          if (!acc[date]) acc[date] = { name: date, spend: 0, revenue: 0, orders: 0 };
          acc[date].spend += c.spend || 0;
          acc[date].revenue += c.revenue || 0;
          acc[date].orders += c.confirmed_orders || 0;
          return acc;
        }, {});

        setChartData(Object.values(grouped));

        // Group by Store Performance
        const storeMap: any = {};
        displayCampaigns.forEach((c: any) => {
          const storeName = c.store_name || 'Unknown Store';
          if (!storeMap[storeName]) {
            storeMap[storeName] = { name: storeName, revenue: 0, spend: 0 };
          }
          storeMap[storeName].revenue += c.meta_revenue || 0;
          storeMap[storeName].spend += c.spend || 0;
        });
        setStorePerformance(Object.values(storeMap).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 5));

        // Group by Employee Performance
        const employeeMap: any = {};
        campaigns.forEach((c: any) => {
          const empName = c.buyer_name || 'Unassigned';
          if (!employeeMap[empName]) {
            employeeMap[empName] = { 
              name: empName, 
              revenue: 0, 
              spend: 0, 
              orders: 0, 
              confirmed_revenue: 0,
              campaign_count: 0,
              cpr: 0, 
              roas: 0 
            };
          }
          employeeMap[empName].revenue += c.meta_revenue || 0;
          employeeMap[empName].spend += c.spend || 0;
          employeeMap[empName].orders += c.meta_purchases || 0;
          
          // Calculate confirmed portion of revenue
          const totalShopifyOrders = (c.shopify_confirmed || 0) + (c.shopify_pending || 0) || 1;
          const confirmedRev = (c.shopify_confirmed || 0) * ((c.shopify_revenue || 0) / totalShopifyOrders);
          employeeMap[empName].confirmed_revenue += confirmedRev;
          employeeMap[empName].campaign_count += 1;
        });

        const employees = Object.values(employeeMap).map((emp: any) => {
          const confirmedRoas = emp.spend > 0 ? emp.confirmed_revenue / emp.spend : 0;
          // Formula: (Confirmed ROAS * 40) + (Campaign Volume * 30) + (Scaled Revenue Impact * 30)
          const rankScore = (confirmedRoas * 40) + (emp.campaign_count * 5) + ( (emp.confirmed_revenue / 1000) * 0.5 );
          
          return {
            ...emp,
            rank_score: rankScore,
            cpr: emp.orders > 0 ? emp.spend / emp.orders : 0,
            roas: emp.spend > 0 ? emp.revenue / emp.spend : 0
          };
        });

        setEmployeePerformance(employees);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  }

  const myRank = useMemo(() => {
    if (profile?.role !== 'employee' || !profile?.full_name) return null;
    const sorted = [...employeePerformance].sort((a: any, b: any) => b.rank_score - a.rank_score);
    const index = sorted.findIndex(e => e.name === profile.full_name);
    return index !== -1 ? index + 1 : null;
  }, [employeePerformance, profile]);

  const totalEmployeesCount = useMemo(() => {
    // Start with physical employees in agency
    let total = agencyEmployeeCount;
    
    // If there are unassigned campaigns with performance, treat "Unassigned" as another competitor
    const hasUnassignedPerformance = employeePerformance.some(e => e.name === 'Unassigned' && e.revenue > 0);
    if (hasUnassignedPerformance) {
      total += 1;
    }
    
    return total || employeePerformance.length;
  }, [employeePerformance, agencyEmployeeCount]);

  const sortedEmployees = useMemo(() => {
    return [...employeePerformance].sort((a: any, b: any) => {
      if (employeeSortBy === 'rank-desc') return b.rank_score - a.rank_score;
      if (employeeSortBy === 'revenue-desc') return b.revenue - a.revenue;
      if (employeeSortBy === 'orders-desc') return b.orders - a.orders;
      if (employeeSortBy === 'roas-desc') return b.roas - a.roas;
      if (employeeSortBy === 'cpr-asc') return a.cpr - b.cpr;
      return 0;
    }).slice(0, 5);
  }, [employeePerformance, employeeSortBy]);

  if (loading && !hasData) {
    return (
      <div className="flex flex-col h-[600px] items-center justify-center gap-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
          <TrendingUp className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold tracking-tight">Syncing Intelligence</h2>
          <p className="text-sm text-muted-foreground animate-pulse max-w-xs mx-auto">Connecting to Meta Ads and Shopify to fetch real-time performance data...</p>
        </div>
      </div>
    );
  }

  if (!hasData && !loading) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Agency Overview</h1>
            <p className="text-muted-foreground">Real-time performance intelligence across all stores.</p>
          </div>
          <Button onClick={() => fetchStats(true)} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Load Dashboard
          </Button>
        </div>

        <Card className="border-dashed border-2 bg-card/30 backdrop-blur-sm p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-6">
            <TrendingUp className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2">No Data Connected</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-8">
            Connect your Meta Ads account and Shopify stores to start tracking performance intelligence.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button render={<a href="/meta-guide" />} nativeButton={false}>
              Connect Meta Ads
            </Button>
            <Button variant="outline" render={<a href="/settings" />} nativeButton={false}>
              Configure Shopify
            </Button>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 opacity-50 grayscale">
          <StatCard title="Total Spend" value={0} icon={DollarSign} suffix="Rs " />
          <StatCard title="Total Revenue" value={0} icon={ShoppingCart} suffix="Rs " />
          <StatCard title="Avg. ROAS" value={0} icon={TrendingUp} />
          <StatCard title="Confirmed Orders" value={0} icon={Package} />
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight lg:text-3xl text-primary">Performance Dashboard</h1>
            <p className="text-sm text-muted-foreground font-medium">Real-time intelligence for your assets.</p>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-3 bg-muted/30 p-1.5 rounded-2xl backdrop-blur-sm border border-border/50">
            {dateRange === 'custom' && (
              <div className="flex items-center gap-2 px-2">
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
              <SelectTrigger className="w-[180px] h-10 rounded-xl bg-background border-none shadow-sm font-bold text-xs px-4 focus:ring-primary/20">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-none shadow-2xl">
                <SelectItem value="today">Today (Live)</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last-7-days">Last 7 Days</SelectItem>
                <SelectItem value="last-30-days">Last 30 Days</SelectItem>
                <SelectItem value="last-60-days">Last 60 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => fetchStats(true)} disabled={loading} size="icon" className={cn("h-10 w-10 rounded-xl shadow-md shadow-primary/5 transition-all", loading && "bg-muted text-muted-foreground")}>
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Total Spend" value={stats.totalSpend} icon={DollarSign} suffix="Rs " change={12} trend="up" />
        <StatCard title="Meta Revenue" value={stats.totalRevenue} icon={ShoppingCart} suffix="Rs " change={8} trend="up" />
        <StatCard title="Meta ROAS" value={stats.avgRoas} icon={Zap} change={10} trend="up" />
        <StatCard 
          title="Meta Orders" 
          value={stats.totalOrders} 
          icon={Users} 
          change={15} 
          trend="up" 
          description={<span className="text-blue-600 dark:text-blue-400">Rs {stats.avgCpr.toFixed(0)} CPR</span>} 
        />
        <StatCard 
          title="Shopify Matched" 
          value={stats.shopifyOrders} 
          icon={Package} 
          change={10} 
          trend="up" 
          description={<span className="text-blue-600 dark:text-blue-400">Rs {stats.shopifyCpr.toFixed(0)} CPR</span>} 
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard 
          title="Confirmed" 
          value={stats.confirmedOrders} 
          icon={CheckCircle2} 
          change={5} 
          trend="up" 
          description={
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <span>Rs {stats.confirmedCpr.toFixed(0)} CPR</span>
              <span className="opacity-20 mx-1">|</span>
              <span className="text-muted-foreground">{stats.confirmationRate.toFixed(1)}%</span>
            </div>
          } 
        />
        <StatCard title="Pending" value={stats.pendingOrders} icon={Clock} change={2} trend="up" />
        <StatCard title="Cancelled" value={stats.cancelledOrders} icon={XCircle} change={1} trend="down" />
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        {profile?.role === 'employee' ? (
          <Card className="lg:col-span-4 border-none shadow-xl bg-gradient-to-br from-primary to-blue-600 text-primary-foreground rounded-[2rem] overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <Award size={200} />
            </div>
            <CardHeader className="p-10 pb-0">
              <CardTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
                <Target className="h-8 w-8" />
                Performance Milestone
              </CardTitle>
              <CardDescription className="text-primary-foreground/70 font-bold uppercase tracking-widest text-[10px]">Your current hierarchy standing</CardDescription>
            </CardHeader>
            <CardContent className="p-10 pt-8">
              <div className="flex flex-col gap-6">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary-foreground/50 mb-4">Enterprise Rank</p>
                  <div className="flex items-baseline gap-4">
                    <span className="text-7xl font-black tracking-tighter">#{myRank || '-'}</span>
                    <span className="text-xl font-bold opacity-50 tracking-tight">/ {totalEmployeesCount} {totalEmployeesCount === 1 ? 'Strategist' : 'Strategists'}</span>
                  </div>
                </div>
                <div className="pt-6 border-t border-white/10">
                  <p className="text-sm font-medium leading-relaxed opacity-90 max-w-md">
                    You are currently ranked <span className="font-black underline decoration-white/30 underline-offset-4">#{myRank || '?'}</span> across the entire agency fleet. Optimize your CPR and scale ROAS to climb the leaderboard.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:col-span-4 border-none shadow-sm bg-card/50 backdrop-blur-sm rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Top Performing Employees</CardTitle>
                <CardDescription>Contribution by employee.</CardDescription>
              </div>
              <Select value={employeeSortBy} onValueChange={setEmployeeSortBy}>
                <SelectTrigger className="w-[140px] h-8 text-[11px] rounded-lg bg-background/50 border-none shadow-sm">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rank-desc">Performance Rank</SelectItem>
                  <SelectItem value="revenue-desc">By Revenue</SelectItem>
                  <SelectItem value="orders-desc">By Orders</SelectItem>
                  <SelectItem value="roas-desc">By ROAS</SelectItem>
                  <SelectItem value="cpr-asc">By CPR</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="h-[350px] pl-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedEmployees} layout="vertical" margin={{ left: 40, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.1} />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    fontSize={12}
                    width={100}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar 
                    dataKey={employeeSortBy.includes('rank') ? 'rank_score' : employeeSortBy.split('-')[0]} 
                    fill="var(--color-primary)" 
                    radius={[0, 4, 4, 0]} 
                    barSize={32} 
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-3 border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Top Performing Stores</CardTitle>
            <CardDescription>Revenue distribution by store.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {storePerformance.map((item, i) => (
                <div key={item.name} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-muted-foreground font-mono">Rs {item.revenue.toLocaleString()}</span>
                  </div>
                  <div className="h-2 w-full bg-accent/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-1000" 
                      style={{ width: `${stats.totalRevenue > 0 ? (item.revenue / stats.totalRevenue) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {storePerformance.length === 0 && (
                <div className="h-64 flex items-center justify-center text-muted-foreground italic">
                  No store data to display
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
