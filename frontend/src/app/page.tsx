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
  const [isInstallingGithub, setIsInstallingGithub] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const isAuth = hostname.startsWith('auth.');
      const isAdmin = hostname.startsWith('admin.');
      setIsAuthSubdomain(isAuth);
      setIsAdminSubdomain(isAdmin);

      // Check for session_data parameter
      const params = new URLSearchParams(window.location.search);
      const logoutParam = params.get('logout');
      if (logoutParam === 'true') {
        localStorage.removeItem('kh-cloud-session');
        useAppStore.getState().logout();
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }

      // Check for GitHub App installation callback
      // GitHub redirects here after install/update with ?installation_id=XXX&setup_action=install
      const installationId = params.get('installation_id');
      const setupAction = params.get('setup_action');
      if (installationId && (setupAction === 'install' || setupAction === 'update')) {
        setIsInstallingGithub(true);
        // Read teamId from localStorage (set before popup was opened)
        // GitHub does NOT send state back via Setup URL, so we use localStorage
        const teamId = localStorage.getItem('github_app_pending_teamId');
        localStorage.removeItem('github_app_pending_teamId');

        // Call backend callback to save installation
        if (teamId) {
          const state = btoa(JSON.stringify({ teamId }));
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://api.khawarahemad.com'}/api/github-app/callback?installation_id=${installationId}&state=${encodeURIComponent(state)}`)
            .then(() => {
              if (window.opener) {
                window.opener.postMessage({ type: 'GITHUB_APP_INSTALLED', installationId, teamId }, '*');
              }
              window.close();
            })
            .catch(() => {
              if (window.opener) {
                window.opener.postMessage({ type: 'GITHUB_APP_INSTALLED', installationId, teamId }, '*');
              }
              window.close();
            });
        } else {
          // If no teamId, just clean up and close popup
          setTimeout(() => {
            if (window.opener) {
              window.opener.postMessage({ type: 'GITHUB_APP_INSTALLED', installationId, teamId: null }, '*');
            }
            window.close();
          }, 500);
        }
        return;
      }



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
          if (isAdminSubdomain) {
            const currentOrigin = window.location.origin;
            const isLoggingOut = localStorage.getItem('logout_initiated') === 'true';
            localStorage.removeItem('logout_initiated');
            if (isLoggingOut) {
              window.location.href = `https://auth.khawarahemad.com?logout=true&redirect=${encodeURIComponent(currentOrigin)}`;
            } else {
              window.location.href = `https://auth.khawarahemad.com?redirect=${encodeURIComponent(currentOrigin)}`;
            }
          } else {
            setView('landing');
          }
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

  if (isInstallingGithub) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#09090b] text-white">
        <div className="flex flex-col items-center space-y-4 max-w-sm text-center px-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-violet-500/10 border-t-2 border-t-violet-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-zinc-500">⚡</span>
            </div>
          </div>
          <h2 className="text-sm font-semibold text-zinc-200">Connecting GitHub App...</h2>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Linking your installations with KH Cloud. This window will close automatically once the authorization is saved.
          </p>
        </div>
      </div>
    );
  }

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
              localStorage.setItem('logout_initiated', 'true');
              localStorage.removeItem('kh-cloud-session');
              useAppStore.getState().logout();
              if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
                window.location.href = 'https://auth.khawarahemad.com?logout=true';
              }
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
    return (
      <LandingPage
        onEnterApp={() => {
          if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
            const currentOrigin = window.location.origin;
            window.location.href = `https://auth.khawarahemad.com?redirect=${encodeURIComponent(currentOrigin)}`;
          } else {
            setView('auth');
          }
        }}
      />
    );
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
