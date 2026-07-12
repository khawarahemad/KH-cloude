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
import EdgeFunctionsTab from '@/components/EdgeFunctionsTab';
import { apiRequest } from '@/lib/api';
import { Shield } from 'lucide-react';

type ViewMode = 'landing' | 'auth' | 'dashboard';

export default function Home() {
  const { user, setUser, setTeams, activeTab, setActiveTab } = useAppStore();
  const [view, setView] = useState<ViewMode>('landing');
  const [isAuthSubdomain, setIsAuthSubdomain] = useState(false);
  const [isAdminSubdomain, setIsAdminSubdomain] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const isAuth = hostname.startsWith('auth.');
      const isAdmin = hostname.startsWith('admin.');
      setIsAuthSubdomain(isAuth);
      setIsAdminSubdomain(isAdmin);

      // Check for session_data parameter
      const params = new URLSearchParams(window.location.search);
      const sessionDataParam = params.get('session_data');
      if (sessionDataParam) {
        try {
          const data = JSON.parse(decodeURIComponent(sessionDataParam));
          setUser(data.user);
          setTeams(data.teams);
          
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        } catch (e) {
          console.error("Session parse failed:", e);
        }
      }
      setLoadingSession(false);
    }
  }, []);

  // Attempt auto-login with query parameters or session simulation
  useEffect(() => {
    if (loadingSession) return;

    if (!window.location.hostname.includes('localhost')) {
      if (isAuthSubdomain) {
        if (user) {
          const params = new URLSearchParams(window.location.search);
          const redirectDest = params.get('redirect') || 'https://cloud.khawarahemad.com';
          const sessionPayload = encodeURIComponent(JSON.stringify({ user, teams: useAppStore.getState().teams }));
          window.location.href = `${redirectDest}?session_data=${sessionPayload}`;
        } else {
          setView('auth');
        }
      } else {
        if (user) {
          setView('dashboard');
          if (isAdminSubdomain && user.role === 'ADMIN') {
            setActiveTab('admin');
          }
        } else {
          const currentOrigin = window.location.origin;
          window.location.href = `https://auth.khawarahemad.com?redirect=${encodeURIComponent(currentOrigin)}`;
        }
      }
    } else {
      if (user) {
        setView('dashboard');
      } else {
        setView('landing');
      }
    }
  }, [user, isAuthSubdomain, isAdminSubdomain, loadingSession]);

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
      case 'edge-functions':
        return <EdgeFunctionsTab />;
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
      <div className="min-h-screen w-screen flex items-center justify-center px-6 text-center select-none app-shell">
        <div className="glass-card relative mx-auto flex max-w-md flex-col items-center gap-6 rounded-[2rem] p-8 md:p-10">
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-red-400/60 to-transparent" />
          <div className="relative">
            <div className="absolute inset-0 rounded-[1.75rem] bg-red-400/20 blur-2xl animate-pulse"></div>
            <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.5rem] border border-red-400/20 bg-red-400/10 text-red-300">
              <Shield size={28} />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold tracking-tight text-white">Access denied</h3>
            <p className="text-sm leading-6 text-slate-300">
              The domain <strong className="text-zinc-200">admin.khawarahemad.com</strong> is reserved for system administrators. Your account does not have admin privileges.
            </p>
          </div>
          <button
            onClick={() => {
              useAppStore.getState().logout();
            }}
            className="app-button-primary"
          >
            Sign out and log in as admin
          </button>
        </div>
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
    <div className="h-screen w-screen flex flex-col overflow-hidden app-shell">
      <Header />

      <div className="flex-1 flex min-h-0 min-w-0">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent">
          {renderActiveTab()}
        </main>
      </div>
    </div>
  );
}
