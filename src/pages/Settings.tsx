import React from 'react';
import { 
  Save, 
  Key, 
  Shield, 
  Facebook, 
  Info,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export default function Settings() {
  const { profile } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [metaConfig, setMetaConfig] = React.useState({
    appId: '',
    appSecret: '',
    accessToken: ''
  });

  // In a real app, we would fetch this from Supabase
  // For now, we'll just simulate saving it
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Simulation of saving to a 'settings' or 'agencies' table
      // const { error } = await supabase.from('agencies').update({
      //   meta_app_id: metaConfig.appId,
      //   meta_app_secret: metaConfig.appSecret,
      //   meta_access_token: metaConfig.accessToken
      // }).eq('id', profile?.agency_id);

      // if (error) throw error;

      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Settings saved successfully', {
        description: 'Your Meta API credentials have been updated.'
      });
    } catch (error: any) {
      toast.error('Failed to save settings', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your agency configuration and API integrations.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Facebook className="h-5 w-5 text-primary" />
              <CardTitle>Meta API Configuration</CardTitle>
            </div>
            <CardDescription>
              Connect your Meta Ads account to fetch real-time performance data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="appId">Meta App ID (Client ID)</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="appId" 
                    placeholder="Enter your Meta App ID" 
                    className="pl-10 bg-background/50"
                    value={metaConfig.appId}
                    onChange={(e) => setMetaConfig({...metaConfig, appId: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="appSecret">Meta App Secret (Client Secret)</Label>
                <div className="relative">
                  <Shield className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="appSecret" 
                    type="password"
                    placeholder="Enter your Meta App Secret" 
                    className="pl-10 bg-background/50"
                    value={metaConfig.appSecret}
                    onChange={(e) => setMetaConfig({...metaConfig, appSecret: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessToken">System User Access Token</Label>
                <div className="relative">
                  <Info className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="accessToken" 
                    type="password"
                    placeholder="Enter your Meta Access Token" 
                    className="pl-10 bg-background/50"
                    value={metaConfig.accessToken}
                    onChange={(e) => setMetaConfig({...metaConfig, accessToken: e.target.value})}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  We recommend using a permanent System User token for reliable data fetching.
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                <span>Need help finding these? Check the <a href="/meta-guide" className="text-primary hover:underline">Meta Setup Guide</a>.</span>
              </div>
              <Button type="submit" disabled={loading} className="gap-2">
                <Save className="h-4 w-4" />
                {loading ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm opacity-50">
          <CardHeader>
            <CardTitle>Shopify Integration</CardTitle>
            <CardDescription>Coming soon: Connect your Shopify stores to track orders and revenue.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled className="gap-2">
              Connect Shopify
              <ExternalLink className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
