import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Store, 
  Users, 
  Settings, 
  PieChart,
  LogOut, 
  TrendingUp,
  Building2,
  AlertCircle,
  Menu,
  X,
  Facebook
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

import { useAuth } from '@/hooks/useAuth';

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  href: string;
  active?: boolean;
  key?: string;
}

const SidebarItem = ({ icon: Icon, label, href, active }: SidebarItemProps) => (
  <Link to={href}>
    <Button
      variant="ghost"
      className={cn(
        "w-full justify-start gap-3 px-3 py-6 text-base font-medium transition-all duration-200",
        active 
          ? "bg-primary/10 text-primary hover:bg-primary/20" 
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Button>
  </Link>
);

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { profile, signOut, isSuperAdmin } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const menuItems = isSuperAdmin 
    ? [
        { icon: Building2, label: 'Agencies', href: '/agencies' },
        { icon: Settings, label: 'Settings', href: '/settings' },
      ]
    : [
        { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
        ...(profile?.role !== 'employee' ? [
          { icon: Store, label: 'Stores', href: '/stores' },
          { icon: Users, label: 'Employees', href: '/employees' },
        ] : []),
        { icon: TrendingUp, label: 'Performance', href: '/performance' },
        { icon: PieChart, label: 'Analytics', href: '/analytics' },
      ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-72 border-r bg-card md:flex md:flex-col shadow-sm">
        <div className="flex h-20 items-center px-8 border-b">
          <Link to="/" className="flex items-center gap-3 font-bold text-2xl tracking-tight text-primary">
            <div className="h-10 w-10 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
              <TrendingUp className="h-6 w-6" />
            </div>
            <span>AdHisaab</span>
          </Link>
        </div>
        
        <nav className="flex-1 space-y-2 p-6">
          {menuItems.map((item) => (
            <SidebarItem
              key={item.href}
              icon={item.icon}
              label={item.label}
              href={item.href}
              active={location.pathname === item.href}
            />
          ))}
        </nav>

        <div className="border-t p-4">
          <div className="flex items-center gap-3 px-2 py-4">
            <Avatar className="h-10 w-10 border">
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {profile?.full_name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-semibold truncate">{profile?.full_name || 'User'}</span>
              <span className="text-xs text-muted-foreground truncate uppercase tracking-wider font-bold">
                {profile?.role?.replace('_', ' ') || 'Member'}
              </span>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
            onClick={() => signOut()}
          >
            <LogOut className="h-5 w-5" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b bg-background/80 backdrop-blur-md z-50 flex items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <TrendingUp className="h-5 w-5 text-primary" />
          <span>AdHisaab</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-background pt-16">
          <nav className="p-4 space-y-2">
            {menuItems.map((item) => (
              <SidebarItem
                key={item.href}
                icon={item.icon}
                label={item.label}
                href={item.href}
                active={location.pathname === item.href}
              />
            ))}
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 text-destructive"
              onClick={() => signOut()}
            >
              <LogOut className="h-5 w-5" />
              Logout
            </Button>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:pl-0 pt-16 md:pt-0 overflow-auto">
        <div className="container mx-auto p-6 max-w-7xl animate-in fade-in duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
