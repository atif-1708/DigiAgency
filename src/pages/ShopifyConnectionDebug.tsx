import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCcw, ShoppingBag, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ShopifyConnectionDebug() {
  const { profile } = useAuth();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDebugInfo = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/shopify/verify-direct?agencyId=${profile?.agency_id}`);
      const data = await resp.json();
      if (!data.success) throw new Error(data.error);
      setResults(data.results);
    } catch (error: any) {
      toast.error('Failed to verify connections', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.agency_id) {
      fetchDebugInfo();
    }
  }, [profile]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Shopify Connection Diagnostic</h1>
          <p className="text-muted-foreground">Direct raw data fetch from Shopify (Last 30 days) - No Meta matching.</p>
        </div>
        <Button onClick={fetchDebugInfo} disabled={loading} className="gap-2">
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Connection Test
        </Button>
      </div>

      <div className="grid gap-6">
        <Card className="border-none shadow-sm bg-card/50">
          <CardHeader>
            <CardTitle>Connected Stores Status</CardTitle>
            <CardDescription>Verifying if API can actually see orders on your Shopify stores.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store Name</TableHead>
                  <TableHead>Connection Status</TableHead>
                  <TableHead className="text-right">Orders Found</TableHead>
                  <TableHead className="text-right">Total Sales (Raw)</TableHead>
                  <TableHead>Issues / Info</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((res, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{res.storeName}</TableCell>
                    <TableCell>
                      {res.status === 'Connected' ? (
                        <div className="flex items-center gap-2 text-green-500">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Active</span>
                        </div>
                      ) : res.status === 'Error' ? (
                        <div className="flex items-center gap-2 text-red-500">
                          <AlertCircle className="h-4 w-4" />
                          <span>Failed</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <AlertCircle className="h-4 w-4" />
                          <span>{res.status}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-blue-500">
                      {res.orderCount !== undefined ? (
                        <div className="flex items-center justify-end gap-1">
                          <ShoppingBag className="h-3 w-3" />
                          {res.orderCount}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600">
                      {res.totalSales !== undefined ? `${res.totalSales} ${res.currency}` : '-'}
                    </TableCell>
                    <TableCell>
                      {res.error ? (
                        <Badge variant="destructive" className="font-normal">
                          {res.error}
                        </Badge>
                      ) : res.orderCount === 0 && res.status === 'Connected' ? (
                        <span className="text-xs text-amber-600 italic">API Connected but zero orders found in last 30 days. Check date range or Shopify status.</span>
                      ) : res.status === 'Connected' ? (
                        <span className="text-xs text-green-600 italic">Connection is perfect. If dashboard is 0, it means UTM/Campaign matching is failing.</span>
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
                {results.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No stores found for this agency.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <section className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-900">
          <h4 className="font-bold flex items-center gap-2 mb-2">
            <AlertCircle className="h-5 w-5" />
            How to read this diagnostic:
          </h4>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li><strong>Status Connected + Orders &gt; 0:</strong> Connection is perfect. Any zeros in the main dashboard mean your Meta campaigns don't have the correct UTMs or IDs to match these Shopify orders.</li>
            <li><strong>Status Connected + Orders = 0:</strong> API is working, but Shopify is returning zero orders. Check if the store actually has orders in the last 30 days.</li>
            <li><strong>Error 401:</strong> Your Shopify Access Token is wrong. You must use the <strong>Admin API Access Token</strong> (starts with <code>shpat_</code>).</li>
            <li><strong>Error Domain/Network:</strong> Shopify domain is wrong or the store is inaccessible.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
