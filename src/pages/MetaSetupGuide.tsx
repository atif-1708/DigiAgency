import React from 'react';
import { 
  Facebook, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  Key,
  Shield,
  Settings
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function MetaSetupGuide() {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const steps = [
    {
      title: "1. Create a Meta Developer Account",
      description: "Go to the Meta for Developers portal and register as a developer if you haven't already.",
      link: "https://developers.facebook.com/",
      icon: Facebook
    },
    {
      title: "2. Create a New App",
      description: "Click on 'My Apps' > 'Create App'. Select 'Other' as the use case and then 'Business' as the app type.",
      icon: Settings
    },
    {
      title: "3. Add Marketing API Product",
      description: "In your App Dashboard, find 'Marketing API' under the 'Add a Product' section and click 'Set Up'.",
      icon: CheckCircle2
    },
    {
      title: "4. Get App ID and App Secret",
      description: "Go to 'App Settings' > 'Basic'. You will find your App ID and App Secret here. You'll need these for AdIntel.",
      icon: Key
    },
    {
      title: "5. Generate Access Token",
      description: "Go to 'Marketing API' > 'Tools'. Select the permissions (ads_read, ads_management, business_management) and click 'Get Token'.",
      icon: Shield
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Meta API Setup Guide</h1>
        <p className="text-muted-foreground">Follow these steps to connect your Facebook Ads data to AdIntel.</p>
      </div>

      <div className="grid gap-6">
        {steps.map((step, index) => (
          <Card key={index} className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-start gap-4 pb-2">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <step.icon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-xl">{step.title}</CardTitle>
                <CardDescription className="text-base">{step.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pl-14">
              {step.link && (
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <a href={step.link} target="_blank" rel="noopener noreferrer">
                    Open Meta Developers
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-none shadow-md bg-primary text-primary-foreground">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <CardTitle>Important Note</CardTitle>
          </div>
          <CardDescription className="text-primary-foreground/80">
            Make sure your app is in 'Live' mode to access real production data. You may need to complete Business Verification in the Meta Business Manager.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Required Permissions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['ads_read', 'ads_management', 'business_management'].map((perm) => (
            <div key={perm} className="p-4 rounded-xl bg-card/50 border flex items-center justify-between">
              <code className="text-sm font-mono">{perm}</code>
              <Button variant="ghost" size="icon" onClick={() => copyToClipboard(perm)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
