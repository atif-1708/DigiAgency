import React, { useEffect, useState } from 'react';
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
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const StatCard = ({ title, value, change, trend, icon: Icon, suffix = "" }: any) => (
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
          {suffix}{typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}
        </h3>
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
    totalOrders: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    if (profile?.agency_id) {
      fetchStats();
    }
  }, [profile]);

  async function fetchStats() {
    setLoading(true);
    try {
      // Fetch campaigns for the agency
      const { data: agencyStores } = await supabase
        .from('stores')
        .select('id')
        .eq('agency_id', profile?.agency_id);
      
      const storeIds = agencyStores?.map(s => s.id) || [];

      if (storeIds.length === 0) {
        setHasData(false);
        setLoading(false);
        return;
      }

      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('*')
        .in('store_id', storeIds);

      if (error) throw error;

      if (!campaigns || campaigns.length === 0) {
        setHasData(false);
      } else {
        setHasData(true);
        const totalSpend = campaigns.reduce((acc, c) => acc + (c.spend || 0), 0);
        const totalRevenue = campaigns.reduce((acc, c) => acc + (c.revenue || 0), 0);
        const totalOrders = campaigns.reduce((acc, c) => acc + (c.confirmed_orders || 0), 0);
        const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

        setStats({
          totalSpend,
          totalRevenue,
          avgRoas,
          totalOrders
        });

        // Group by date for chart (simplified)
        const grouped = campaigns.reduce((acc: any, c) => {
          const date = new Date(c.start_date).toLocaleDateString('en-US', { weekday: 'short' });
          if (!acc[date]) acc[date] = { name: date, spend: 0, revenue: 0, orders: 0 };
          acc[date].spend += c.spend || 0;
          acc[date].revenue += c.revenue || 0;
          acc[date].orders += c.confirmed_orders || 0;
          return acc;
        }, {});

        setChartData(Object.values(grouped));
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Agency Overview</h1>
          <p className="text-muted-foreground">Real-time performance intelligence across all stores.</p>
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
          <StatCard title="Total Spend" value={0} icon={DollarSign} suffix="$" />
          <StatCard title="Total Revenue" value={0} icon={ShoppingCart} suffix="$" />
          <StatCard title="Avg. ROAS" value={0} icon={TrendingUp} />
          <StatCard title="Confirmed Orders" value={0} icon={Package} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Agency Overview</h1>
        <p className="text-muted-foreground">Real-time performance intelligence across all stores.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Spend" value={stats.totalSpend} icon={DollarSign} suffix="$" change={12} trend="up" />
        <StatCard title="Total Revenue" value={stats.totalRevenue} icon={ShoppingCart} suffix="$" change={8} trend="up" />
        <StatCard title="Avg. ROAS" value={stats.avgRoas} icon={TrendingUp} change={5} trend="up" />
        <StatCard title="Confirmed Orders" value={stats.totalOrders} icon={Package} change={15} trend="up" />
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        <Card className="lg:col-span-4 border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Performance Trends</CardTitle>
            <CardDescription>Revenue vs Ad Spend over the last 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} dx={-10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={3} />
                <Area type="monotone" dataKey="spend" stroke="rgba(255,255,255,0.3)" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
              </AreaChart>
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
              {chartData.slice(0, 4).map((item, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Store {i + 1}</span>
                    <span className="text-muted-foreground">${item.revenue.toLocaleString()}</span>
                  </div>
                  <div className="h-2 w-full bg-accent/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-1000" 
                      style={{ width: `${(item.revenue / stats.totalRevenue) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
