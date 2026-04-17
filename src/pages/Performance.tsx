import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  Filter, 
  Download, 
  Search,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
  Loader2,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { formatLocalYYYYMMDD } from '@/lib/date-utils';

export default function Performance() {
  const { profile } = useAuth();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStore, setSelectedStore] = useState('all-stores');
  const [stores, setStores] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState('last-30-days');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });

  useEffect(() => {
    if (profile?.agency_id) {
      fetchStores();
      fetchData();
    }
  }, [profile, dateRange, customDates]);

  async function fetchStores() {
    const { data } = await supabase
      .from('stores')
      .select('id, name')
      .eq('agency_id', profile?.agency_id);
    setStores(data || []);
  }

  async function fetchData(isRefresh = false) {
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
        throw new Error(`Server returned an unexpected response format (${response.status}). Please try refreshing in a few moments.`);
      }

      const result = await response.json();

      if (!result.success) throw new Error(result.error);

      setCampaigns(result.data || []);
    } catch (error: any) {
      toast.error('Failed to fetch performance data', { description: error.message });
    } finally {
      setLoading(false);
    }
  }

  const filteredCampaigns = campaigns.filter(camp => {
    const matchesSearch = 
      camp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      camp.store_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      camp.buyer_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStore = selectedStore === 'all-stores' || camp.store_id === selectedStore;
    
    return matchesSearch && matchesStore;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Campaign Performance</h1>
          <p className="text-muted-foreground">Detailed analytics and ROI tracking for all active campaigns.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" disabled={campaigns.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button className="gap-2" onClick={() => fetchData(true)} disabled={loading}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh Data
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-4">
          {profile?.role === 'employee' && !profile.identifier && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-3 text-amber-500">
              <AlertCircle className="h-5 w-5" />
              <div className="text-sm">
                <p className="font-semibold">Missing Identifier</p>
                <p>Your profile does not have a suffix identifier (e.g., "PK"). Campaigns will not match your account correctly.</p>
              </div>
            </div>
          )}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search campaigns, stores, or identifiers..." 
                className="pl-10 rounded-xl bg-background/50" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="w-[160px] rounded-xl bg-background/50">
                  <SelectValue>
                    {selectedStore === 'all-stores' ? 'All Stores' : stores.find(s => s.id === selectedStore)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-stores">All Stores</SelectItem>
                  {stores.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[160px] rounded-xl bg-background/50">
                  <SelectValue placeholder="Time Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last-7-days">Last 7 Days</SelectItem>
                  <SelectItem value="last-30-days">Last 30 Days</SelectItem>
                  <SelectItem value="last-60-days">Last 60 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              {dateRange === 'custom' && (
                <div className="flex items-center gap-2">
                  <Input 
                    type="date" 
                    className="w-[140px] rounded-xl bg-background/50" 
                    value={customDates.start}
                    onChange={(e) => setCustomDates(prev => ({ ...prev, start: e.target.value }))}
                  />
                  <Input 
                    type="date" 
                    className="w-[140px] rounded-xl bg-background/50" 
                    value={customDates.end}
                    onChange={(e) => setCustomDates(prev => ({ ...prev, end: e.target.value }))}
                  />
                </div>
              )}
              <Button variant="outline" size="icon" className="rounded-xl">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-muted">
                <TableHead className="pl-6">Campaign Name</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">CPR</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-4">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground animate-pulse">Connecting to Meta Ads API...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground">
                      <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center">
                        <TrendingUp className="h-8 w-8 opacity-20" />
                      </div>
                      <div className="space-y-1 max-w-sm mx-auto">
                        <p className="text-lg font-semibold text-foreground">No campaign data found</p>
                        <p className="text-sm">We couldn't find any campaigns matching your criteria. This could be due to your date range, store selection, or missing Meta API tokens.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={() => window.open('/meta-guide', '_blank')} className="gap-2">
                          <ExternalLink className="h-4 w-4" />
                          View Setup Guide
                        </Button>
                        <Button onClick={() => fetchData(true)} className="gap-2">
                          <RefreshCcw className="h-4 w-4" />
                          Force Refresh
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCampaigns.map((camp) => {
                  const roas = camp.spend > 0 ? (camp.revenue / camp.spend).toFixed(2) : '0.00';
                  const cpr = camp.confirmed_orders > 0 ? (camp.spend / camp.confirmed_orders).toFixed(2) : '0.00';
                  
                  return (
                    <TableRow key={camp.id} className="hover:bg-accent/30 border-muted transition-colors">
                      <TableCell className="pl-6 font-medium max-w-[200px] truncate">
                        {camp.name}
                      </TableCell>
                      <TableCell>{camp.store_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {camp.buyer_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">Rs {camp.spend.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-green-500">Rs {camp.revenue.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <div className={cn(
                          "inline-flex items-center gap-1 font-bold",
                          Number(roas) >= 2 ? "text-green-500" : "text-amber-500"
                        )}>
                          {roas}x
                          {Number(roas) >= 2 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">Rs {cpr}</TableCell>
                      <TableCell className="text-right">{camp.confirmed_orders}</TableCell>
                      <TableCell className="text-right pr-6">
                        <Badge variant={camp.status === 'ACTIVE' ? 'default' : camp.status === 'PAUSED' ? 'destructive' : 'secondary'}>
                          {camp.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
