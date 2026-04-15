import React, { useEffect, useState } from 'react';
import { Plus, Store as StoreIcon, RefreshCcw, ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function Stores() {
  const { profile } = useAuth();
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form state
  const [newStore, setNewStore] = useState({
    name: '',
    domain: '',
    token: ''
  });

  useEffect(() => {
    if (profile?.agency_id || profile?.role === 'super_admin') {
      fetchStores();
    } else {
      setLoading(false);
    }
  }, [profile]);

  async function fetchStores() {
    try {
      let query = supabase.from('stores').select('*, ad_accounts(count)');
      
      if (profile?.role !== 'super_admin') {
        query = query.eq('agency_id', profile?.agency_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setStores(data || []);
    } catch (error: any) {
      toast.error('Failed to fetch stores', { description: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleAddStore(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.agency_id) {
      toast.error('No agency associated with your account');
      return;
    }

    setIsAdding(true);
    try {
      const { error } = await supabase.from('stores').insert({
        name: newStore.name,
        shopify_domain: newStore.domain,
        shopify_access_token: newStore.token,
        agency_id: profile.agency_id,
        status: 'Connected'
      });

      if (error) throw error;

      toast.success('Store added successfully');
      setNewStore({ name: '', domain: '', token: '' });
      fetchStores();
    } catch (error: any) {
      toast.error('Failed to add store', { description: error.message });
    } finally {
      setIsAdding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Stores</h1>
          <p className="text-muted-foreground">Manage your Shopify stores and Meta Ads integrations.</p>
        </div>
        
        <Dialog>
          <DialogTrigger render={<Button className="gap-2" />}>
            <Plus className="h-4 w-4" />
            Add Store
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleAddStore}>
              <DialogHeader>
                <DialogTitle>Add New Store</DialogTitle>
                <DialogDescription>
                  Connect a new Shopify store to your agency.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Store Name</Label>
                  <Input 
                    id="name" 
                    placeholder="e.g. FashionHub" 
                    value={newStore.name}
                    onChange={e => setNewStore({...newStore, name: e.target.value})}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="domain">Shopify Domain</Label>
                  <Input 
                    id="domain" 
                    placeholder="your-store.myshopify.com" 
                    value={newStore.domain}
                    onChange={e => setNewStore({...newStore, domain: e.target.value})}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="token">Shopify Admin API Token</Label>
                  <Input 
                    id="token" 
                    type="password" 
                    value={newStore.token}
                    onChange={e => setNewStore({...newStore, token: e.target.value})}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isAdding}>
                  {isAdding ? 'Connecting...' : 'Connect Shopify'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {stores.length === 0 ? (
        <Card className="border-dashed border-2 flex flex-col items-center justify-center p-12 text-center">
          <StoreIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <CardTitle>No stores found</CardTitle>
          <CardDescription>Add your first Shopify store to start tracking performance.</CardDescription>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <Card key={store.id} className="border-none shadow-sm bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-300">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <StoreIcon className="h-5 w-5" />
                </div>
                <Badge variant={store.status === 'Connected' ? 'default' : 'secondary'}>
                  {store.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-xl">{store.name}</CardTitle>
                <CardDescription className="mt-1 font-mono text-xs">{store.shopify_domain}</CardDescription>
                
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Ad Accounts</span>
                    <span className="font-semibold">{store.ad_accounts?.[0]?.count || 0}</span>
                  </div>
                  
                  <div className="pt-4 flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 gap-2">
                      <RefreshCcw className="h-3 w-3" />
                      Sync
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 gap-2">
                      <ShieldCheck className="h-3 w-3" />
                      Meta Ads
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Integration Status</CardTitle>
          <CardDescription>Monitor the health of your API connections.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { name: 'Shopify API', status: 'Operational', latency: '120ms' },
              { name: 'Meta Marketing API', status: 'Operational', latency: '240ms' },
              { name: 'Supabase DB', status: 'Operational', latency: '45ms' },
            ].map((api) => (
              <div key={api.name} className="flex items-center justify-between p-4 rounded-xl bg-accent/30">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="font-medium">{api.name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{api.latency}</span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                    {api.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
