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
