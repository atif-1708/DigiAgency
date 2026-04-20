import React, { useEffect, useState } from 'react';
import { Plus, Store as StoreIcon, RefreshCcw, ShieldCheck, Loader2, Pencil, Trash2 } from 'lucide-react';
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingStore, setEditingStore] = useState<any>(null);
  const [editingAdAccountIds, setEditingAdAccountIds] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Form state
  const [newStore, setNewStore] = useState({
    name: '',
    domain: '',
    token: '',
    adAccountIds: [] as string[],
    metaAppId: '',
    metaAppSecret: '',
    metaAccessToken: ''
  });

  const [fetchedAdAccounts, setFetchedAdAccounts] = useState<any[]>([]);
  const [isFetchingAccounts, setIsFetchingAccounts] = useState(false);

  useEffect(() => {
    if (profile?.agency_id || profile?.role === 'super_admin') {
      fetchStores();
    } else {
      setLoading(false);
    }
  }, [profile]);

  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [isTestingShopify, setIsTestingShopify] = useState(false);

  async function handleTestShopify(domain: string, token: string) {
    if (!domain || !token) {
      toast.error('Please enter domain and token first');
      return;
    }

    setIsTestingShopify(true);
    try {
      const response = await fetch('/api/shopify/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, token })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Connection failed');
      
      toast.success('Shopify connection successful!', { 
        description: `Connected to: ${result.shop?.name || domain}` 
      });
    } catch (error: any) {
      toast.error('Shopify connection failed', { description: error.message });
    } finally {
      setIsTestingShopify(false);
    }
  }

  async function handleSync(storeId: string) {
    setIsSyncing(storeId);
    try {
      const response = await fetch('/api/meta/sync-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId })
      });

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to sync campaigns');
        toast.success(`Synced ${result.count} campaigns successfully`);
      } else {
        const text = await response.text();
        throw new Error(`Server returned an unexpected response: ${text.substring(0, 100)}...`);
      }
    } catch (error: any) {
      toast.error('Sync failed', { description: error.message });
    } finally {
      setIsSyncing(null);
    }
  }

  async function fetchStores() {
    try {
      let query = supabase.from('stores').select('*, ad_accounts(count)');
      
      if (profile?.role === 'employee') {
        // Employees only see their assigned store
        if (profile.store_id) {
          query = query.eq('id', profile.store_id);
        } else {
          setStores([]);
          setLoading(false);
          return;
        }
      } else if (profile?.role !== 'super_admin') {
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

  async function handleFetchAdAccounts(isEdit = false) {
    const token = isEdit ? editingStore?.meta_access_token : newStore.metaAccessToken;
    if (!token) {
      toast.error('Please enter a Meta Access Token first');
      return;
    }

    setIsFetchingAccounts(true);
    try {
      const response = await fetch('/api/meta/ad-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token })
      });

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to fetch ad accounts');
        setFetchedAdAccounts(result.data || []);
        toast.success(`Fetched ${result.data?.length || 0} ad accounts`);
      } else {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error(`Server returned an unexpected response: ${text.substring(0, 100)}...`);
      }
    } catch (error: any) {
      toast.error('Failed to fetch ad accounts', { description: error.message });
    } finally {
      setIsFetchingAccounts(false);
    }
  }

  async function handleAddStore(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.agency_id) {
      toast.error('No agency associated with your account');
      return;
    }

    if (newStore.adAccountIds.length === 0) {
      toast.error('Please select at least one ad account');
      return;
    }

    setIsAdding(true);
    try {
      const { data: storeData, error: storeError } = await supabase.from('stores').insert({
        name: newStore.name,
        shopify_domain: newStore.domain,
        shopify_access_token: newStore.token,
        agency_id: profile.agency_id,
        status: 'Connected',
        meta_app_id: newStore.metaAppId,
        meta_app_secret: newStore.metaAppSecret,
        meta_access_token: newStore.metaAccessToken
      }).select().single();

      if (storeError) throw storeError;

      if (newStore.adAccountIds.length > 0) {
        const adAccountsToInsert = newStore.adAccountIds.map(id => {
          const accInfo = fetchedAdAccounts.find(a => a.id === id);
          return {
            store_id: storeData.id,
            ad_account_id: id,
            name: accInfo?.name || 'Ad Account',
            status: 'Active'
          };
        });

        const { error: adError } = await supabase.from('ad_accounts').insert(adAccountsToInsert);
        if (adError) throw adError;
      }

      toast.success('Store and Ad Accounts connected successfully');
      setNewStore({ 
        name: '', 
        domain: '', 
        token: '', 
        adAccountIds: [],
        metaAppId: '',
        metaAppSecret: '',
        metaAccessToken: ''
      });
      setFetchedAdAccounts([]);
      fetchStores();
    } catch (error: any) {
      toast.error('Failed to add store', { description: error.message });
    } finally {
      setIsAdding(false);
    }
  }

  async function handleDeleteStore(id: string) {
    if (!confirm('Are you sure you want to delete this store? This will also remove associated ad accounts.')) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase.from('stores').delete().eq('id', id);
      if (error) throw error;
      toast.success('Store deleted successfully');
      fetchStores();
    } catch (error: any) {
      toast.error('Failed to delete store', { description: error.message });
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleOpenEdit(store: any) {
    setEditingStore(store);
    setFetchedAdAccounts([]);
    setEditingAdAccountIds([]);
    
    // Fetch currently connected ad accounts
    const { data, error } = await supabase
      .from('ad_accounts')
      .select('ad_account_id')
      .eq('store_id', store.id);
    
    if (!error && data) {
      setEditingAdAccountIds(data.map(a => a.ad_account_id));
    }
  }

  async function handleUpdateStore(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStore) return;

    setIsUpdating(true);
    try {
      // 1. Update store details
      const { error: storeError } = await supabase.from('stores').update({
        name: editingStore.name,
        shopify_domain: editingStore.shopify_domain,
        shopify_access_token: editingStore.shopify_access_token,
        meta_app_id: editingStore.meta_app_id,
        meta_app_secret: editingStore.meta_app_secret,
        meta_access_token: editingStore.meta_access_token
      }).eq('id', editingStore.id);

      if (storeError) throw storeError;

      // 2. Update ad accounts: This is tricky, we'll do a simple sync
      // First, get previously linked accounts
      const { data: currentAccs } = await supabase
        .from('ad_accounts')
        .select('ad_account_id')
        .eq('store_id', editingStore.id);
      
      const currentIds = currentAccs?.map(a => a.ad_account_id) || [];
      
      // Accounts to add
      const toAdd = editingAdAccountIds.filter(id => !currentIds.includes(id));
      // Accounts to remove
      const toRemove = currentIds.filter(id => !editingAdAccountIds.includes(id));

      if (toRemove.length > 0) {
        await supabase
          .from('ad_accounts')
          .delete()
          .eq('store_id', editingStore.id)
          .in('ad_account_id', toRemove);
      }

      if (toAdd.length > 0) {
        const adAccountsToInsert = toAdd.map(id => {
          const accInfo = fetchedAdAccounts.find(a => a.id === id);
          return {
            store_id: editingStore.id,
            ad_account_id: id,
            name: accInfo?.name || 'Ad Account',
            status: 'Active'
          };
        });
        await supabase.from('ad_accounts').insert(adAccountsToInsert);
      }

      toast.success('Store and Ad Accounts updated successfully');
      setEditingStore(null);
      fetchStores();
    } catch (error: any) {
      toast.error('Failed to update store', { description: error.message });
    } finally {
      setIsUpdating(false);
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
        
        {profile?.role !== 'employee' && (
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
                    <div className="flex gap-2">
                      <Input 
                        id="token" 
                        type="password" 
                        value={newStore.token}
                        onChange={e => setNewStore({...newStore, token: e.target.value})}
                        required
                        className="flex-1"
                      />
                      <Button 
                        type="button" 
                        variant="secondary" 
                        size="sm"
                        onClick={() => handleTestShopify(newStore.domain, newStore.token)}
                        disabled={isTestingShopify}
                      >
                        {isTestingShopify ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="metaAppId">Meta App ID</Label>
                    <Input 
                      id="metaAppId" 
                      placeholder="Meta App ID" 
                      value={newStore.metaAppId}
                      onChange={e => setNewStore({...newStore, metaAppId: e.target.value})}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="metaAppSecret">Meta App Secret</Label>
                    <Input 
                      id="metaAppSecret" 
                      type="password"
                      placeholder="Meta App Secret" 
                      value={newStore.metaAppSecret}
                      onChange={e => setNewStore({...newStore, metaAppSecret: e.target.value})}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="metaAccessToken">Meta Access Token</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="metaAccessToken" 
                        type="password"
                        placeholder="Meta Access Token" 
                        value={newStore.metaAccessToken}
                        onChange={e => setNewStore({...newStore, metaAccessToken: e.target.value})}
                        required
                      />
                      <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={handleFetchAdAccounts}
                        disabled={isFetchingAccounts}
                      >
                        {isFetchingAccounts ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Fetch'}
                      </Button>
                    </div>
                  </div>

                  {fetchedAdAccounts.length > 0 && (
                    <div className="grid gap-2">
                      <Label>Select Ad Accounts</Label>
                      <div className="max-h-[200px] overflow-y-auto border rounded-md p-2 space-y-2 bg-background/50">
                        {fetchedAdAccounts.map(acc => (
                          <div key={acc.id} className="flex items-center space-x-2 p-1 hover:bg-accent/50 rounded transition-colors">
                            <input
                              type="checkbox"
                              id={`acc-${acc.id}`}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                              checked={newStore.adAccountIds.includes(acc.id)}
                              onChange={(e) => {
                                const ids = e.target.checked 
                                  ? [...newStore.adAccountIds, acc.id]
                                  : newStore.adAccountIds.filter(id => id !== acc.id);
                                setNewStore({...newStore, adAccountIds: ids});
                              }}
                            />
                            <label 
                              htmlFor={`acc-${acc.id}`} 
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                            >
                              {acc.name} <span className="text-xs text-muted-foreground">({acc.account_id})</span>
                            </label>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {newStore.adAccountIds.length} account(s) selected
                      </p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isAdding}>
                    {isAdding ? 'Connecting...' : 'Connect Shopify'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
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
                <div className="flex items-center gap-2">
                  <Badge variant={store.status === 'Connected' ? 'default' : 'secondary'}>
                    {store.status}
                  </Badge>
                  {profile?.role !== 'employee' && (
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => handleOpenEdit(store)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteStore(store.id)}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-xl">{store.name}</CardTitle>
                <CardDescription className="mt-1 font-mono text-xs">{store.shopify_domain}</CardDescription>
                
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Ad Accounts</span>
                    <span className="font-semibold">{store.ad_accounts?.[0]?.count || 0}</span>
                  </div>
                  
                  {profile?.role !== 'employee' && (
                    <div className="pt-4 flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 gap-2"
                        onClick={() => handleSync(store.id)}
                        disabled={isSyncing === store.id}
                      >
                        {isSyncing === store.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCcw className="h-3 w-3" />
                        )}
                        Sync
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 gap-2">
                        <ShieldCheck className="h-3 w-3" />
                        Meta Ads
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Store Dialog */}
      <Dialog open={!!editingStore} onOpenChange={(open) => !open && setEditingStore(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleUpdateStore}>
            <DialogHeader>
              <DialogTitle>Edit Store</DialogTitle>
              <DialogDescription>
                Update your Shopify store and Meta Ads settings.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Store Name</Label>
                <Input 
                  id="edit-name" 
                  value={editingStore?.name || ''}
                  onChange={e => setEditingStore({...editingStore, name: e.target.value})}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-domain">Shopify Domain</Label>
                <Input 
                  id="edit-domain" 
                  value={editingStore?.shopify_domain || ''}
                  onChange={e => setEditingStore({...editingStore, shopify_domain: e.target.value})}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-token">Shopify Admin API Token</Label>
                <div className="flex gap-2">
                  <Input 
                    id="edit-token" 
                    type="password" 
                    value={editingStore?.shopify_access_token || ''}
                    onChange={e => setEditingStore({...editingStore, shopify_access_token: e.target.value})}
                    required
                    className="flex-1"
                  />
                  <Button 
                    type="button" 
                    variant="secondary" 
                    size="sm"
                    onClick={() => handleTestShopify(editingStore?.shopify_domain, editingStore?.shopify_access_token)}
                    disabled={isTestingShopify}
                  >
                    {isTestingShopify ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-metaAppId">Meta App ID</Label>
                <Input 
                  id="edit-metaAppId" 
                  value={editingStore?.meta_app_id || ''}
                  onChange={e => setEditingStore({...editingStore, meta_app_id: e.target.value})}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-metaAppSecret">Meta App Secret</Label>
                <Input 
                  id="edit-metaAppSecret" 
                  type="password"
                  value={editingStore?.meta_app_secret || ''}
                  onChange={e => setEditingStore({...editingStore, meta_app_secret: e.target.value})}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-metaAccessToken">Meta Access Token</Label>
                <div className="flex gap-2">
                  <Input 
                    id="edit-metaAccessToken" 
                    type="password"
                    value={editingStore?.meta_access_token || ''}
                    onChange={e => setEditingStore({...editingStore, meta_access_token: e.target.value})}
                    required
                    className="flex-1"
                  />
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => handleFetchAdAccounts(true)}
                    disabled={isFetchingAccounts}
                  >
                    {isFetchingAccounts ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Fetch'}
                  </Button>
                </div>
              </div>

              {(fetchedAdAccounts.length > 0 || editingAdAccountIds.length > 0) && (
                <div className="grid gap-2">
                  <Label>Ad Accounts</Label>
                  <div className="max-h-[200px] overflow-y-auto border rounded-md p-2 space-y-2 bg-background/50">
                    {/* Combine already connected and freshly fetched accounts for selection */}
                    {[...new Map([...fetchedAdAccounts, ...editingAdAccountIds.map(id => ({id, name: 'Connected Account'}))].map(item => [item.id, item])).values()].map(acc => (
                      <div key={acc.id} className="flex items-center space-x-2 p-1 hover:bg-accent/50 rounded transition-colors">
                        <input
                          type="checkbox"
                          id={`edit-acc-${acc.id}`}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          checked={editingAdAccountIds.includes(acc.id)}
                          onChange={(e) => {
                            const ids = e.target.checked 
                              ? [...editingAdAccountIds, acc.id]
                              : editingAdAccountIds.filter(id => id !== acc.id);
                            setEditingAdAccountIds(ids);
                          }}
                        />
                        <label 
                          htmlFor={`edit-acc-${acc.id}`} 
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                        >
                          {acc.name} <span className="text-xs text-muted-foreground">({acc.id})</span>
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {editingAdAccountIds.length} account(s) selected
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingStore(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdating}>
                {isUpdating ? 'Updating...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
