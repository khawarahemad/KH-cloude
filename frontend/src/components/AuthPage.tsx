'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Key, ShieldCheck, ArrowLeft, Loader2, ArrowRight, Check, Sparkles } from 'lucide-react';
import { apiRequest } from '@/lib/api';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

const Github = ({ size = 24, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

interface AuthPageProps {
  onBack: () => void;
  onAuthSuccess: (data: { user: any; teams: any[] }) => void;
}

export default function AuthPage({ onBack, onAuthSuccess }: AuthPageProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const path = isRegister ? '/auth/register' : '/auth/login';
    const payload = isRegister ? { name, email, password } : { email, password };

    try {
      const data = await apiRequest(path, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      onAuthSuccess(
        isRegister
          ? { user: data.user, teams: [data.team] }
          : { user: data.user, teams: data.teams || [] }
      );
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSimulate = (provider: string) => {
    if (provider === 'GitHub') {
      const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || 'Iv23libP2nC0sNq21c8u';
      const redirectUri = `${window.location.origin}/auth/callback/github`;
      const params = new URLSearchParams(window.location.search);
      const redirectDest = params.get('redirect');
      if (redirectDest) {
        localStorage.setItem('auth_redirect_dest', redirectDest);
      }

      const state = Math.random().toString(36).substring(7);
      localStorage.setItem('github_oauth_state', state);
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user&state=${state}`;
      return;
    }

    setLoading(true);
    setTimeout(() => {
      onAuthSuccess({
        user: { id: 'mock-oauth-user', name: `Developer via ${provider}`, email: `dev@${provider.toLowerCase()}.com` },
        teams: [{ id: 'mock-team', name: 'Personal Workspace', slug: 'personal' }],
      });
      setLoading(false);
    }, 900);
  };

  return (
    <div className="min-h-screen overflow-hidden text-white app-shell">
      <button
        onClick={onBack}
        className="absolute left-6 top-6 z-20 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="mx-auto grid min-h-screen max-w-7xl gap-8 px-6 py-20 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }} className="space-y-8">
          <div className="space-y-4">
            <div className="app-chip w-fit">
              <Sparkles size={14} className="text-cyan-200" />
              Secure access to your cloud workspace
            </div>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
              {isRegister ? 'Create your KH Cloud account.' : 'Welcome back to KH Cloud.'}
            </h1>
            <p className="max-w-xl text-base leading-7 text-slate-300 md:text-lg">
              Sign in to manage deployment pipelines, databases, object storage, and edge functions from a single workspace.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ['Access', 'Role-aware workspace routing'],
              ['Security', 'Passkey, OAuth, and email login'],
              ['Speed', 'Launch from a single verified session'],
            ].map(([title, copy]) => (
              <div key={title} className="glass-card rounded-[1.5rem] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</div>
                <div className="mt-2 text-sm font-semibold text-white">{copy}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.05 }} className="relative">
          <div className="absolute -inset-6 rounded-[2rem] bg-cyan-400/10 blur-3xl" />
          <div className="glass-card relative rounded-[2rem] p-6 md:p-8">
            <div className="mb-7 flex items-center justify-between gap-4">
              <div>
                <div className="app-muted-label">Authentication</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {isRegister ? 'Create account' : 'Sign in'}
                </h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                <ShieldCheck size={20} />
              </div>
            </div>

            {error && (
              <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <AnimatePresence mode="popLayout">
                {isRegister && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2">
                    <label className="app-muted-label block">Full name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Jane Doe"
                        className="glass-input h-12 pl-11"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                <label className="app-muted-label block">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="glass-input h-12 pl-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="app-muted-label block">Password</label>
                  {!isRegister && (
                    <button type="button" className="text-xs font-semibold text-cyan-200 transition-colors hover:text-cyan-100">
                      Forgot?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="glass-input h-12 pl-11"
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="app-button-primary h-12 w-full">
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Authenticating...
                  </>
                ) : isRegister ? (
                  <>
                    Create account
                    <ArrowRight size={16} />
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">or continue with</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={() => handleOAuthSimulate('GitHub')} disabled={loading} className="app-button-secondary h-12">
                <Github size={16} />
                GitHub
              </button>
              <button onClick={() => handleOAuthSimulate('Google')} disabled={loading} className="app-button-secondary h-12">
                <Key size={16} className="text-slate-400" />
                Google
              </button>
            </div>

            <button onClick={() => handleOAuthSimulate('Passkey')} disabled={loading} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-dashed border-cyan-400/30 bg-cyan-400/5 text-sm font-semibold text-cyan-100 transition-all hover:bg-cyan-400/10 active:scale-[0.98]">
              <ShieldCheck size={16} />
              Sign in with passkey or 2FA
            </button>

            <button onClick={() => setIsRegister(!isRegister)} className="mt-6 flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-300 transition-colors hover:text-white">
              {isRegister ? 'Already have an account?' : "Need an account?"}
              <span className="text-cyan-200">{isRegister ? 'Sign in' : 'Create one'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
