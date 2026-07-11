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

type ViewMode = 'landing' | 'auth' | 'dashboard';

export default function Home() {
  const { user, setUser, setTeams, activeTab } = useAppStore();
  const [view, setView] = useState<ViewMode>('landing');

  // Attempt auto-login with query parameters or session simulation
  useEffect(() => {
    if (user) {
      setView('dashboard');
    } else {
      setView('landing');
    }
  }, [user]);

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

  if (view === 'landing') {
    return <LandingPage onEnterApp={() => setView('auth')} />;
  }

  if (view === 'auth') {
    return <AuthPage onBack={() => setView('landing')} onAuthSuccess={handleAuthSuccess} />;
  }

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
