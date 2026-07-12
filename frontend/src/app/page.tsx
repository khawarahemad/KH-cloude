'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import LandingPage from '@/components/LandingPage';
import AuthPage from '@/components/AuthPage';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ProjectsTab from '@/components/ProjectsTab';
import DatabasesTab from '@/components/DatabasesTab';
import StorageTab from '@/components/StorageTab';
import TeamsTab from '@/components/TeamsTab';
import BillingTab from '@/components/BillingTab';
import AdminTab from '@/components/AdminTab';
import { apiRequest } from '@/lib/api';
import { Shield } from 'lucide-react';

type ViewMode = 'landing' | 'auth' | 'dashboard';

export default function Home() {
  const { user, setUser, setTeams, activeTab, setActiveTab } = useAppStore();
  const [view, setView] = useState<ViewMode>('landing');
  const [isAdminSubdomain, setIsAdminSubdomain] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname.startsWith('admin.')) {
        setIsAdminSubdomain(true);
      }
    }
  }, []);

  // Attempt auto-login with query parameters or session simulation
  useEffect(() => {
    if (user) {
      setView('dashboard');
      if (isAdminSubdomain && user.role === 'ADMIN') {
        setActiveTab('admin');
      }
    } else {
      if (isAdminSubdomain) {
        setView('auth');
      } else {
        setView('landing');
      }
    }
  }, [user, isAdminSubdomain]);

  const handleAuthSuccess = (data: { user: any; teams: any[] }) => {
    setUser(data.user);
    setTeams(data.teams);
    setView('dashboard');
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'projects':
        return <ProjectsTab />;
      case 'databases':
        return <DatabasesTab />;
      case 'storage':
        return <StorageTab />;
      case 'teams':
        return <TeamsTab />;
      case 'billing':
        return <BillingTab />;
      case 'admin':
        return <AdminTab />;
      default:
        return <ProjectsTab />;
    }
  };

  if (view === 'dashboard' && isAdminSubdomain && user?.role !== 'ADMIN') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#030303] text-center p-6 select-none">
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-3xl bg-red-500/20 blur-xl animate-pulse"></div>
          <div className="relative w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
            <Shield size={28} />
          </div>
        </div>
        <h3 className="font-extrabold text-xl mb-2 text-white">Access Denied</h3>
        <p className="text-xs text-zinc-400 max-w-sm mb-8 leading-relaxed">
          The domain <strong className="text-zinc-300">admin.khawarahemad.com</strong> is reserved for system administrators. Your account does not have admin privileges.
        </p>
        <button
          onClick={() => {
            useAppStore.getState().logout();
          }}
          className="h-10 px-6 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold text-xs transition-all active:scale-95 duration-100"
        >
          Sign Out & Log In as Admin
        </button>
      </div>
    );
  }

  if (view === 'landing') {
    return <LandingPage onEnterApp={() => setView('auth')} />;
  }

  if (view === 'auth') {
    return <AuthPage onBack={() => {
      if (isAdminSubdomain) {
        // Can't go back to landing on admin subdomain
      } else {
        setView('landing');
      }
    }} onAuthSuccess={handleAuthSuccess} />;}

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#030303]">
      {/* Top Navigation Header */}
      <Header />

      {/* Main body split (Sidebar + Viewport) */}
      <div className="flex-1 flex min-h-0 min-w-0">
        <Sidebar />
        
        {/* Dynamic Inner Tab Viewport */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#030303]">
          {renderActiveTab()}
        </main>
      </div>
    </div>
  );
}
