import React from 'react';
import { cn } from '@/lib/utils';
import { 
  DollarSign, 
  ShoppingCart, 
  TrendingUp, 
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Package
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

const mockData = [
  { name: 'Mon', spend: 4500, revenue: 12000, orders: 45 },
  { name: 'Tue', spend: 5200, revenue: 15000, orders: 52 },
  { name: 'Wed', spend: 4800, revenue: 11000, orders: 38 },
  { name: 'Thu', spend: 6100, revenue: 18000, orders: 65 },
  { name: 'Fri', spend: 5500, revenue: 22000, orders: 82 },
  { name: 'Sat', spend: 7200, revenue: 25000, orders: 95 },
  { name: 'Sun', spend: 6800, revenue: 21000, orders: 78 },
];

const StatCard = ({ title, value, change, trend, icon: Icon, suffix = "" }: any) => (
  <Card className="overflow-hidden border-none shadow-sm bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-300">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <Icon className="h-6 w-6" />
        </div>
        {change && (
          <Badge variant={trend === 'up' ? 'default' : 'destructive'} className="rounded-full px-2 py-0.5 text-[10px] font-bold">
            {trend === 'up' ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
            {change}%
          </Badge>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <h3 className="text-2xl font-bold mt-1">
          {suffix}{value.toLocaleString()}
        </h3>
      </div>
    </CardContent>
  </Card>
);

export default function Dashboard() {
  const [hasData, setHasData] = React.useState(false);

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
            <Button render={<a href="/meta-guide" />}>
              Connect Meta Ads
            </Button>
            <Button variant="outline" render={<a href="/settings" />}>
              Configure Shopify
            </Button>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 opacity-50 grayscale">
          <StatCard title="Total Spend" value={0} icon={DollarSign} suffix="Rs. " />
          <StatCard title="Total Revenue" value={0} icon={ShoppingCart} suffix="Rs. " />
          <StatCard title="Avg. ROAS" value={0} icon={TrendingUp} />
          <StatCard title="Confirmed Orders" value={0} icon={Package} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ... existing dashboard content ... */}
    </div>
  );
}
