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
  Zap
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
  <Card className="overflow-hidden border-none shadow-sm bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-300">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <Icon className="h-6 w-6" />
        </div>
        {change !== undefined && (
          <Badge variant={trend === 'up' ? 'default' : 'destructive'} className="rounded-full px-2 py-0.5 text-[10px] font-bold">
            {trend === 'up' ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
            {change}%
          </Badge>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <h3 className="text-2xl font-bold mt-1">
          {suffix}{typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value}
        </h3>
        {description && <p className="text-[10px] mt-1 text-muted-foreground font-medium">{description}</p>}
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
  const [employeeSortBy, setEmployeeSortBy] = useState('revenue-desc');
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [dateRange, setDateRange] = useState('last-30-days');

  useEffect(() => {
    if (profile?.agency_id) {
      fetchStats();
    }
  }, [profile, dateRange]);

  async function fetchStats(isRefresh = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        agencyId: profile?.agency_id || '',
      });
      
      if (isRefresh) {
        params.append('refresh', 'true');
      }

      if (profile?.role === 'employee') {
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
        const totalSpend = campaigns.reduce((acc: number, c: any) => acc + (c.spend || 0), 0);
        const totalMetaRevenue = campaigns.reduce((acc: number, c: any) => acc + (c.meta_revenue || 0), 0);
        const totalMetaPurchases = campaigns.reduce((acc: number, c: any) => acc + (c.meta_purchases || 0), 0);
        
        const shopifyOrders = campaigns.reduce((acc: number, c: any) => acc + (c.shopify_confirmed || 0) + (c.shopify_pending || 0) + (c.shopify_cancelled || 0), 0);
        const confirmedOrders = campaigns.reduce((acc: number, c: any) => acc + (c.shopify_confirmed || 0), 0);
        const pendingOrders = campaigns.reduce((acc: number, c: any) => acc + (c.shopify_pending || 0), 0);
        const cancelledOrders = campaigns.reduce((acc: number, c: any) => acc + (c.shopify_cancelled || 0), 0);
        
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
        const grouped = campaigns.reduce((acc: any, c: any) => {
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
        campaigns.forEach((c: any) => {
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
            employeeMap[empName] = { name: empName, revenue: 0, spend: 0, orders: 0, cpr: 0, roas: 0 };
          }
          employeeMap[empName].revenue += c.meta_revenue || 0;
          employeeMap[empName].spend += c.spend || 0;
          employeeMap[empName].orders += c.meta_purchases || 0;
        });

        const employees = Object.values(employeeMap).map((emp: any) => ({
          ...emp,
          cpr: emp.orders > 0 ? emp.spend / emp.orders : 0,
          roas: emp.spend > 0 ? emp.revenue / emp.spend : 0
        }));

        setEmployeePerformance(employees);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  }

  const sortedEmployees = useMemo(() => {
    return [...employeePerformance].sort((a: any, b: any) => {
      if (employeeSortBy === 'revenue-desc') return b.revenue - a.revenue;
      if (employeeSortBy === 'orders-desc') return b.orders - a.orders;
      if (employeeSortBy === 'roas-desc') return b.roas - a.roas;
      if (employeeSortBy === 'cpr-asc') return a.cpr - b.cpr;
      return 0;
    }).slice(0, 5);
  }, [employeePerformance, employeeSortBy]);

  if (loading && !hasData) {
    return (
      <div className="flex flex-col h-[400px] items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Fetching live intelligence from Meta Ads...</p>
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
    <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Agency Overview</h1>
            <p className="text-muted-foreground">Real-time performance intelligence across all stores.</p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px] rounded-xl bg-card/50 backdrop-blur-sm border-none shadow-sm">
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
            <Button onClick={() => fetchStats(true)} disabled={loading} className="gap-2">
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Spend" value={stats.totalSpend} icon={DollarSign} suffix="Rs " change={12} trend="up" />
        <StatCard title="Meta ROAS" value={stats.avgRoas} icon={Zap} suffix="" change={8} trend="up" />
        <StatCard title="Meta Orders" value={stats.totalOrders} icon={Users} change={15} trend="up" description={`CPR: Rs ${stats.avgCpr.toFixed(0)}`} />
        <StatCard title="Shopify Matched" value={stats.shopifyOrders} icon={Package} change={10} trend="up" description={`CPR: Rs ${stats.shopifyCpr.toFixed(0)}`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Confirmed" value={stats.confirmedOrders} icon={CheckCircle2} change={5} trend="up" description={`CPR: Rs ${stats.confirmedCpr.toFixed(0)} | ${stats.confirmationRate.toFixed(1)}%`} />
        <StatCard title="Pending" value={stats.pendingOrders} icon={Clock} change={2} trend="up" />
        <StatCard title="Cancelled" value={stats.cancelledOrders} icon={XCircle} change={1} trend="down" />
        <StatCard title="Total Campaigns" value={stats.totalSpend > 0 ? chartData.length : 0} icon={Target} />
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        <Card className="lg:col-span-4 border-none shadow-sm bg-card/50 backdrop-blur-sm">
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
                  dataKey={employeeSortBy.split('-')[0]} 
                  fill="var(--color-primary)" 
                  radius={[0, 4, 4, 0]} 
                  barSize={32} 
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

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
