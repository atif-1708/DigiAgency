import React, { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { 
  BarChart3, 
  TrendingUp, 
  Filter, 
  RefreshCcw,
  Loader2,
  Award,
  Target,
  Zap,
  ShoppingBag,
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

export default function ShopifyAnalytics() {
  const { profile } = useAuth();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState('all-employees');
  const [dateRange, setDateRange] = useState('last-30-days');
  const [minRoas, setMinRoas] = useState(0);
  const [selectedCprRange, setSelectedCprRange] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('cpr-asc');

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

      params.append('startDate', formatLocalYYYYMMDD(start));
      params.append('endDate', formatLocalYYYYMMDD(end));

      const response = await fetch(`/api/performance?${params.toString()}`);
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response (ShopifyAnalytics):", text);
        throw new Error(`Server returned HTML instead of data (${response.status}). This usually means the API route was not found.`);
      }

      const result = await response.json();

      if (!result.success) throw new Error(result.error);

      // Process campaigns to calculate CPR correctly using Shopify data
      const processed = (result.data || []).map((camp: any) => ({
        ...camp,
        cpr: camp.confirmed_orders > 0 ? camp.spend / camp.confirmed_orders : 0,
        roas: camp.spend > 0 ? camp.revenue / camp.spend : 0
      }));

      setCampaigns(processed);
    } catch (error: any) {
      toast.error('Failed to fetch analytics data', { description: error.message });
    } finally {
      setLoading(false);
    }
  }

  const baseFilteredCampaigns = useMemo(() => {
    return campaigns.filter(camp => {
      return selectedEmployee === 'all-employees' || camp.employee_id === selectedEmployee;
    });
  }, [campaigns, selectedEmployee]);

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

  const stats = useMemo(() => {
    const totalSpend = baseFilteredCampaigns.reduce((sum, c) => sum + c.spend, 0);
    const totalRevenue = baseFilteredCampaigns.reduce((sum, c) => sum + (c.revenue || 0), 0);
    const totalConfirmed = baseFilteredCampaigns.reduce((sum, c) => sum + (c.confirmed_orders || 0), 0);
    const totalPending = baseFilteredCampaigns.reduce((sum, c) => sum + (c.pending_orders || 0), 0);
    const totalCancelled = baseFilteredCampaigns.reduce((sum, c) => sum + (c.cancelled_orders || 0), 0);
    
    return {
      totalSpend,
      totalRevenue,
      totalConfirmed,
      totalPending,
      totalCancelled,
      avgRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      avgCpr: totalConfirmed > 0 ? totalSpend / totalConfirmed : 0
    };
  }, [baseFilteredCampaigns]);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Shopify-Matched Analytics</h1>
          <p className="text-muted-foreground">Orders matched from Shopify via UTM Tracking.</p>
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
            Refresh Sync
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Confirmed (Fulfilled)</p>
                <h3 className="text-2xl font-bold mt-1 text-green-500">{stats.totalConfirmed}</h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending (Unfulfilled)</p>
                <h3 className="text-2xl font-bold mt-1 text-amber-500">{stats.totalPending}</h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Cancelled</p>
                <h3 className="text-2xl font-bold mt-1 text-red-500">{stats.totalCancelled}</h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                <XCircle className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Shopify Revenue</p>
                <h3 className="text-2xl font-bold mt-1">Rs {stats.totalRevenue.toLocaleString()}</h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <ShoppingBag className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Real ROAS (Confirmed)</p>
                <h3 className="text-2xl font-bold mt-1">{stats.avgRoas.toFixed(2)}x</h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Real CPR (Confirmed)</p>
                <h3 className="text-2xl font-bold mt-1">Rs {stats.avgCpr.toFixed(0)}</h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                <Award className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              Campaign Order Performance
            </CardTitle>
            
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1">Sort By</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[180px] rounded-xl bg-background/50 text-xs text-primary">
                    <SelectValue placeholder="Sort Results" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpr-asc">CPR: Low to High</SelectItem>
                    <SelectItem value="roas-desc">ROAS: High to Low</SelectItem>
                    <SelectItem value="orders-desc">Orders: High to Low</SelectItem>
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
                <TableHead className="text-right">Meta Purch.</TableHead>
                <TableHead className="text-right text-green-600">Shopify Conf.</TableHead>
                <TableHead className="text-right text-amber-600">Pending</TableHead>
                <TableHead className="text-right text-red-600">Cancelled</TableHead>
                <TableHead className="text-right">Real CPR</TableHead>
                <TableHead className="text-right pr-6">Real ROAS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : filteredCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center text-muted-foreground italic">
                    No campaigns found with UTM data.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCampaigns.map((camp) => (
                  <TableRow key={camp.id} className="hover:bg-accent/30 border-muted transition-colors">
                    <TableCell className="pl-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-primary">{camp.name}</span>
                        <span className="text-xs text-muted-foreground">{camp.store_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{camp.meta_purchases || 0}</TableCell>
                    <TableCell className="text-right text-green-500 font-bold">{camp.confirmed_orders}</TableCell>
                    <TableCell className="text-right text-amber-500 font-bold">{camp.pending_orders}</TableCell>
                    <TableCell className="text-right text-red-500 font-bold">{camp.cancelled_orders}</TableCell>
                    <TableCell className="text-right font-mono font-bold">Rs {camp.cpr.toFixed(0)}</TableCell>
                    <TableCell className="text-right pr-6 font-bold text-primary">
                      {camp.roas.toFixed(2)}x
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
