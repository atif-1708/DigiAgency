import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Stores from '@/pages/Stores';
import Employees from '@/pages/Employees';
import Performance from '@/pages/Performance';
import Agencies from '@/pages/Agencies';
import Login from '@/pages/Login';
import MetaSetupGuide from '@/pages/MetaSetupGuide';
import Settings from '@/pages/Settings';

import { useAuth } from '@/hooks/useAuth';
import { Toaster } from '@/components/ui/sonner';
import { Loader2 } from 'lucide-react';

export default function App() {
  const { user, loading, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <Toaster position="top-right" />
      </Router>
    );
  }

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stores" element={<Stores />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/meta-guide" element={<MetaSetupGuide />} />
          {isSuperAdmin && <Route path="/agencies" element={<Agencies />} />}
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <Toaster position="top-right" />
    </Router>
  );
}
