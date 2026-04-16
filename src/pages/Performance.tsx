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
  Loader2
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

export default function Performance() {
  const { profile } = useAuth();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStore, setSelectedStore] = useState('all-stores');
  const [stores, setStores] = useState<any[]>([]);

  useEffect(() => {
    if (profile?.agency_id) {
      fetchData();
      fetchStores();
    }
  }, [profile]);

  async function fetchStores() {
    const { data } = await supabase
      .from('stores')
      .select('id, name')
      .eq('agency_id', profile?.agency_id);
    setStores(data || []);
  }

  async function fetchData() {
    setLoading(true);
    try {
      let query = supabase
        .from('campaigns')
        .select(`
          *,
          stores (name),
          profiles (full_name)
        `);

      if (profile?.role !== 'super_admin') {
        // Filter by agency stores
        const { data: agencyStores } = await supabase
          .from('stores')
          .select('id')
          .eq('agency_id', profile?.agency_id);
        
        const storeIds = agencyStores?.map(s => s.id) || [];
        query = query.in('store_id', storeIds);
      }

      const { data, error } = await query.order('spend', { ascending: false });
      if (error) throw error;
      setCampaigns(data || []);
    } catch (error: any) {
      toast.error('Failed to fetch performance data', { description: error.message });
    } finally {
      setLoading(false);
    }
  }

  const filteredCampaigns = campaigns.filter(camp => {
    const matchesSearch = 
      camp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      camp.stores?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      camp.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
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
          <Button className="gap-2" onClick={fetchData} disabled={loading}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh Data
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search campaigns, stores, or employees..." 
                className="pl-10 rounded-xl bg-background/50" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="w-[160px] rounded-xl bg-background/50">
                  <SelectValue placeholder="All Stores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-stores">All Stores</SelectItem>
                  {stores.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select defaultValue="all-time">
                <SelectTrigger className="w-[160px] rounded-xl bg-background/50">
                  <SelectValue placeholder="Time Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last-7-days">Last 7 Days</SelectItem>
                  <SelectItem value="this-month">This Month</SelectItem>
                </SelectContent>
              </Select>
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
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : filteredCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <TrendingUp className="h-8 w-8 opacity-20" />
                      <p>No campaign data found.</p>
                      <p className="text-xs">Connect your Meta Ads account to sync performance data.</p>
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
                      <TableCell>{camp.stores?.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {camp.profiles?.full_name || 'Unassigned'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">${camp.spend.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-green-500">${camp.revenue.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <div className={cn(
                          "inline-flex items-center gap-1 font-bold",
                          Number(roas) >= 2 ? "text-green-500" : "text-amber-500"
                        )}>
                          {roas}x
                          {Number(roas) >= 2 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">${cpr}</TableCell>
                      <TableCell className="text-right">{camp.confirmed_orders}</TableCell>
                      <TableCell className="text-right pr-6">
                        <Badge variant={camp.status === 'ACTIVE' ? 'default' : 'secondary'}>
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
