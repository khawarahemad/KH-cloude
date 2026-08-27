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
import SettingsTab from '@/components/SettingsTab';
import BackupsTab from '@/components/BackupsTab';
import { apiRequest, getDomainUrl, getBaseDomain, getApiBase } from '@/lib/api';
import { Shield } from 'lucide-react';

type ViewMode = 'landing' | 'auth' | 'dashboard';

export default function Home() {
  const { user, setUser, setTeams, activeTab, setActiveTab } = useAppStore();
  const [view, setView] = useState<ViewMode>('landing');
  const [isAuthSubdomain, setIsAuthSubdomain] = useState(false);
  const [isAdminSubdomain, setIsAdminSubdomain] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [isInstallingGithub, setIsInstallingGithub] = useState(false);
  const [githubInstallStatus, setGithubInstallStatus] = useState<'linking' | 'success' | 'error'>('linking');
  const [githubInstallMessage, setGithubInstallMessage] = useState('Linking your GitHub App installation with KH Cloud...');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hostname = window.location.hostname;
    const isAuth = hostname.startsWith('auth.');
    const isAdmin = hostname.startsWith('admin.');
    setIsAuthSubdomain(isAuth);
    setIsAdminSubdomain(isAdmin);

    const params = new URLSearchParams(window.location.search);
    const logoutParam = params.get('logout');
    if (logoutParam === 'true') {
      localStorage.removeItem('kh-cloud-session');
      useAppStore.getState().logout();
      window.history.replaceState({}, '', window.location.pathname);
    }

    // GitHub App setup URL redirect:
    // ?installation_id=XXX&setup_action=install|update
    const installationId = params.get('installation_id');
    const setupAction = params.get('setup_action');
    if (installationId && (setupAction === 'install' || setupAction === 'update')) {
      setIsInstallingGithub(true);
      setGithubInstallStatus('linking');

      const teamId = localStorage.getItem('github_app_pending_teamId');

      const notifyOpener = (payload: Record<string, unknown>) => {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, window.location.origin);
          }
        } catch {
          // Cross-origin opener access can throw — storage event below is the backup.
        }
        // Broadcast to any open KH Cloud tab (works even when postMessage/close fail)
        try {
          localStorage.setItem(
            'github_app_installed_event',
            JSON.stringify({ ...payload, ts: Date.now() }),
          );
          // Allow storage listeners to fire, then clear
          setTimeout(() => localStorage.removeItem('github_app_installed_event'), 500);
        } catch {}
      };

      const resumeApp = () => {
        localStorage.removeItem('github_app_pending_teamId');
        window.history.replaceState({}, '', window.location.pathname);
        setIsInstallingGithub(false);
        setLoadingSession(false);
        // Mark so ProjectsTab can refresh if this was same-tab
        sessionStorage.setItem('github_app_just_installed', '1');
      };

      const finishAndCloseOrResume = (ok: boolean, message?: string) => {
        setGithubInstallStatus(ok ? 'success' : 'error');
        setGithubInstallMessage(
          message ||
            (ok
              ? 'GitHub App connected. Closing this window...'
              : 'Could not save the installation. Returning to the dashboard...'),
        );

        notifyOpener({
          type: 'GITHUB_APP_INSTALLED',
          installationId,
          teamId: teamId || null,
          success: ok,
        });

        // Try closing popup; if the browser blocks it (common after GitHub redirects),
        // fall back to resuming the app in this same tab so the spinner never hangs.
        const tryClose = () => {
          try {
            window.close();
          } catch {}
        };

        setTimeout(() => {
          tryClose();
          setTimeout(() => {
            // window.closed is unreliable for same-tab; if we're still here, resume.
            resumeApp();
          }, 400);
        }, ok ? 700 : 1200);
      };

      const saveInstallation = async () => {
        if (!teamId) {
          finishAndCloseOrResume(
            false,
            'Install session expired. You can close this window and click Refresh in KH Cloud.',
          );
          return;
        }

        const state = btoa(JSON.stringify({ teamId }))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const apiBase = getApiBase().replace(/\/api$/, '');
        const url = `${apiBase}/api/github-app/callback?installation_id=${encodeURIComponent(installationId)}&state=${encodeURIComponent(state)}`;

        try {
          const res = await fetch(url);
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message || `Callback failed (${res.status})`);
          }
          finishAndCloseOrResume(true, 'GitHub App connected successfully!');
        } catch (err: any) {
          console.error('GitHub App callback failed:', err);
          finishAndCloseOrResume(false, err?.message || 'Failed to link GitHub App.');
        }
      };

      saveInstallation();
      return;
    }

    const sessionDataParam = params.get('session_data');
    if (sessionDataParam) {
      try {
        const data = JSON.parse(decodeURIComponent(sessionDataParam));
        setUser(data.user);
        setTeams(data.teams);
        window.history.replaceState({}, '', window.location.pathname);
      } catch (e) {
        console.error('Session parse failed:', e);
      }
    }
    setLoadingSession(false);
  }, []);

  // Attempt auto-login with query parameters or session simulation
  useEffect(() => {
    if (loadingSession) return;

    if (!window.location.hostname.includes('localhost')) {
      if (isAuthSubdomain) {
        if (user) {
          const params = new URLSearchParams(window.location.search);
          const redirectDest = params.get('redirect') || getDomainUrl('cloud');
          const sessionPayload = encodeURIComponent(JSON.stringify({ user, teams: useAppStore.getState().teams }));
          window.location.href = `${redirectDest}?session_data=${sessionPayload}`;
        } else {
          setView('auth');
        }
      } else {
        if (user) {
          // If user is in store but accessToken is missing, this is a stale session
          // from before JWT auth was implemented. Force re-login.
          const { accessToken } = useAppStore.getState();
          if (!accessToken) {
            useAppStore.getState().logout();
            setView('landing');
            return;
          }
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
              window.location.href = `${getDomainUrl('auth')}?logout=true&redirect=${encodeURIComponent(currentOrigin)}`;
            } else {
              window.location.href = `${getDomainUrl('auth')}?redirect=${encodeURIComponent(currentOrigin)}`;
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
      case 'settings':
        return <SettingsTab />;
      case 'backups':
        return <BackupsTab />;
      case 'admin':
        return <AdminTab />;
      default:
        return <ProjectsTab />;
    }
  };

  if (isInstallingGithub) {
    const isSuccess = githubInstallStatus === 'success';
    const isError = githubInstallStatus === 'error';
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#09090b] text-white">
        <div className="flex flex-col items-center space-y-4 max-w-sm text-center px-6">
          <div className="relative">
            {githubInstallStatus === 'linking' ? (
              <div className="w-16 h-16 rounded-full border-2 border-violet-500/10 border-t-2 border-t-violet-500 animate-spin" />
            ) : (
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center border ${
                  isSuccess
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-red-500/30 bg-red-500/10 text-red-400'
                }`}
              >
                <span className="text-2xl">{isSuccess ? '✓' : '!'}</span>
              </div>
            )}
          </div>
          <h2 className="text-sm font-semibold text-zinc-200">
            {isSuccess ? 'Connected' : isError ? 'Connection issue' : 'Connecting GitHub App...'}
          </h2>
          <p className="text-xs text-zinc-500 leading-relaxed">{githubInstallMessage}</p>
          {(isSuccess || isError) && (
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('github_app_pending_teamId');
                window.history.replaceState({}, '', window.location.pathname);
                setIsInstallingGithub(false);
                setLoadingSession(false);
                sessionStorage.setItem('github_app_just_installed', '1');
              }}
              className="mt-2 h-9 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-200 transition-colors"
            >
              Continue to dashboard
            </button>
          )}
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
              The domain <strong className="text-zinc-200">admin.{getBaseDomain()}</strong> is reserved for system administrators. Your account does not have admin privileges.
            </p>
          </div>
          <button
            onClick={() => {
              localStorage.setItem('logout_initiated', 'true');
              localStorage.removeItem('kh-cloud-session');
              useAppStore.getState().logout();
              if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
                window.location.href = `${getDomainUrl('auth')}?logout=true`;
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
            window.location.href = `${getDomainUrl('auth')}?redirect=${encodeURIComponent(currentOrigin)}`;
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
