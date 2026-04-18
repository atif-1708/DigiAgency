import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, 
  Mail, 
  Lock, 
  ArrowRight, 
  Zap, 
  Target, 
  BarChart3, 
  ShieldCheck,
  Facebook,
  Store,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      toast.success('Login successful!', {
        description: 'Welcome back to AdHisaab.',
      });
      navigate('/');
    } catch (error: any) {
      toast.error('Login failed', {
        description: error.message || 'Please check your credentials.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background selection:bg-primary/20">
      {/* Left Pane - Marketing / Product Showcase */}
      <div className="hidden lg:flex lg:w-3/5 relative bg-[#0a0a0a] overflow-hidden p-16 flex-col justify-between">
        {/* Animated Background Elements */}
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-primary/20 rounded-full blur-[140px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-2xl shadow-primary/40">
              <TrendingUp className="h-7 w-7" />
            </div>
            <span className="text-2xl font-black tracking-tighter text-white">AdHisaab</span>
          </div>

          <div className="max-w-2xl space-y-8">
            <Badge className="bg-primary/10 text-primary border-primary/20 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
              Performance Intelligence Platform v2.0
            </Badge>
            <h1 className="text-6xl xl:text-7xl font-black text-white leading-[0.9] tracking-tighter">
              The Mission Control for <span className="text-primary italic">Modern Agencies.</span>
            </h1>
            <p className="text-xl text-neutral-400 font-medium leading-relaxed max-w-xl">
              Unify Meta Ads intelligence with real-time Shopify order matching. Scale your ROAS with precision, built for elite media buyers.
            </p>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-12 mt-20">
          {[
            { icon: BarChart3, title: "Precision Metrics", desc: "Live ROI & ROAS tracking with millisecond precision across all stores." },
            { icon: ShieldCheck, title: "Secure Scale", desc: "Enterprise-grade RBAC and data isolation for agency-fleet management." },
            { icon: Zap, title: "Instant Sync", desc: "Real-time Shopify connection using secure, encrypted API tunnels." },
            { icon: Target, title: "Buyer Rankings", desc: "Motivate performance with automated internal leaderboard intelligence." }
          ].map((feature, i) => (
            <div key={i} className="space-y-3 group">
              <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="text-white font-bold text-lg">{feature.title}</h3>
              <p className="text-neutral-500 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>

        <div className="relative z-10 pt-16 border-t border-white/5 flex items-center justify-between">
          <div className="flex gap-4">
            <div className="flex -space-x-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-10 w-10 rounded-full border-2 border-[#0a0a0a] bg-neutral-800 overflow-hidden">
                  <img src={`https://picsum.photos/seed/${i+10}/40/40`} alt="user" referrerPolicy="no-referrer" />
                </div>
              ))}
            </div>
            <div className="flex flex-col">
              <span className="text-white font-bold text-sm">Trusted by 50+ Global Agencies</span>
              <span className="text-neutral-500 text-xs">Managing $10M+ Monthly Ad Spend</span>
            </div>
          </div>
          <div className="flex gap-6 text-white/30">
            <Facebook size={20} />
            <Store size={20} />
            <ExternalLink size={20} />
          </div>
        </div>
      </div>

      {/* Right Pane - Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-16 relative overflow-hidden">
        {/* Mobile Background Elements */}
        <div className="lg:hidden absolute top-[-10%] left-[-10%] w-[80%] h-[80%] bg-primary/10 rounded-full blur-[120px]" />
        
        <div className="w-full max-w-md space-y-12 relative z-10">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="text-xl font-black tracking-tighter">AdHisaab</span>
          </div>

          <div className="space-y-4">
            <h2 className="text-4xl font-black tracking-tight leading-none">Security Access</h2>
            <p className="text-neutral-500 font-medium">Please authorize to enter the dashboard environment.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-5">
              <div className="group space-y-2">
                <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 px-1">Identity (Email)</Label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-primary transition-colors">
                    <Mail size={18} />
                  </div>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="name@agency.com" 
                    className="pl-12 h-14 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border-none shadow-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="group space-y-2">
                <div className="flex items-center justify-between px-1">
                  <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Security Key (Password)</Label>
                  <Button variant="link" className="p-0 text-[10px] font-black uppercase tracking-widest text-primary hover:no-underline">Reset Key</Button>
                </div>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-primary transition-colors">
                    <Lock size={18} />
                  </div>
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••" 
                    className="pl-12 h-14 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border-none shadow-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <Button 
              className="w-full h-14 rounded-2xl text-base font-black gap-3 shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all group" 
              type="submit" 
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Establish Connection'}
              <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </form>

          <div className="pt-8 border-t flex flex-col gap-4">
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800">
              <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <ShieldCheck size={20} />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold uppercase tracking-widest">Authorized Entry Only</p>
                <p className="text-[11px] text-neutral-500 leading-normal">Your connection is secured with end-to-end encryption. Multiple failed attempts will trigger a security isolation protocol.</p>
              </div>
            </div>
            
            <p className="text-center text-[10px] text-neutral-400 font-bold uppercase tracking-[0.3em] mt-4">
              © 2026 AdHisaab Security Systems
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
