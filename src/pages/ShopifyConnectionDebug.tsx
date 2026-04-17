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
                  <TableHead>Shop API</TableHead>
                  <TableHead>Orders API</TableHead>
                  <TableHead>Masked Token</TableHead>
                  <TableHead className="text-right">Orders (30d)</TableHead>
                  <TableHead className="text-right">Sales (Raw)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((res, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{res.storeName}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{res.domainUsed}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {res.shopConnectivity === 'Success' ? (
                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Authorized
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Failed</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {res.ordersConnectivity === 'Success' ? (
                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Permitted
                        </Badge>
                      ) : res.status === 'Connected' ? (
                        <Badge variant="destructive" className="bg-amber-500 border-amber-500">No Permission</Badge>
                      ) : (
                        <Badge variant="secondary">-</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="text-[10px] bg-muted p-1 rounded font-mono">
                        {res.maskedToken}
                      </code>
                    </TableCell>
                    <TableCell className="text-right font-mono text-blue-500">
                      {res.orderCount !== undefined ? res.orderCount : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600">
                      {res.totalSales !== undefined ? `${res.totalSales} ${res.currency || ''}` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
                {results.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No stores found for this agency.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="mt-6 space-y-4">
              {results.some(r => r.error || r.isScopeIssue || r.ordersConnectivity?.includes('Failed')) && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-red-900 text-sm">
                  <h5 className="font-bold flex items-center gap-2 mb-1">
                    <AlertCircle className="h-4 w-4" />
                    Detected Errors:
                  </h5>
                  <ul className="list-disc list-inside space-y-1">
                    {results.map((res, i) => (
                      (res.error || res.isScopeIssue) ? (
                        <li key={i}>
                          <strong>{res.storeName}</strong>: {typeof res.error === 'string' ? res.error : JSON.stringify(res.error)} 
                          {res.ordersConnectivity?.includes('Failed') && ` (Scope Error: ${res.ordersConnectivity})`}
                        </li>
                      ) : null
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <section className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-900">
          <h4 className="font-bold flex items-center gap-2 mb-2">
            <AlertCircle className="h-5 w-5" />
            How to read this diagnostic:
          </h4>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li><strong>Authorized (Success):</strong> Token is valid and API can talk to your store.</li>
            <li><strong>Permitted (Success):</strong> You have correctly added the <code>read_orders</code> scope.</li>
            <li><strong>No Permission:</strong> Token is valid, but you forgot to check the <code>read_orders</code> permission in Shopify.</li>
            <li><strong>HTTP 401:</strong> Token is completely invalid. Check <code>shpat_</code> prefix.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
