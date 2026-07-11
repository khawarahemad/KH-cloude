'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Key, ShieldCheck, ArrowLeft, Loader2 } from 'lucide-react';
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

      // Handle successful authentication
      if (isRegister) {
        // Automatically switch to login or log in directly if user/team info is returned
        onAuthSuccess({
          user: data.user,
          teams: [data.team],
        });
      } else {
        onAuthSuccess({
          user: data.user,
          teams: data.teams || [],
        });
      }
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
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white flex flex-col justify-center items-center relative overflow-hidden px-6 font-sans">
      {/* Glows */}
      <div className="absolute top-[20%] left-[30%] w-[300px] h-[300px] rounded-full bg-purple-900/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[30%] w-[300px] h-[300px] rounded-full bg-indigo-900/10 blur-[100px] pointer-events-none" />

      {/* Back to landing */}
      <button
        onClick={onBack}
        className="absolute top-6 left-6 text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1 active:scale-95 duration-100"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 mb-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-white text-base font-black">KH</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isRegister ? 'Create your KH Cloud Account' : 'Sign in to KH Cloud'}
          </h2>
          <p className="text-sm text-zinc-400">
            {isRegister ? 'Get started deploying apps instantly.' : 'Welcome back to your deployment center.'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="glass p-8 rounded-2xl border border-white/10 shadow-2xl relative">
          {error && (
            <div className="mb-6 p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-xs text-red-400 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="popLayout">
              {isRegister && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-1.5"
                >
                  <label className="text-xs text-zinc-400 font-medium">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full h-10 pl-10 pr-4 rounded-xl glass-input text-sm text-white"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full h-10 pl-10 pr-4 rounded-xl glass-input text-sm text-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400 font-medium">Password</label>
                {!isRegister && (
                  <button type="button" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                    Forgot?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full h-10 pl-10 pr-4 rounded-xl glass-input text-sm text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-200 disabled:bg-zinc-600 disabled:text-zinc-400 transition-all flex items-center justify-center gap-2 mt-6 active:scale-95 duration-100"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Authenticating...
                </>
              ) : isRegister ? (
                'Create Account'
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Separator */}
          <div className="flex items-center gap-3 my-6">
            <div className="h-[1px] bg-white/10 flex-1" />
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">or continue with</span>
            <div className="h-[1px] bg-white/10 flex-1" />
          </div>

          {/* Social Logins */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleOAuthSimulate('GitHub')}
              disabled={loading}
              className="h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors active:scale-95 duration-100"
            >
              <Github size={16} />
              GitHub
            </button>
            <button
              onClick={() => handleOAuthSimulate('Google')}
              disabled={loading}
              className="h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors active:scale-95 duration-100"
            >
              <Key size={16} className="text-zinc-400" />
              Google
            </button>
          </div>

          {/* Passkeys Simulation */}
          <button
            onClick={() => handleOAuthSimulate('Passkey')}
            disabled={loading}
            className="w-full h-10 rounded-xl border border-dashed border-white/10 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-300 font-medium text-xs flex items-center justify-center gap-2 mt-3 transition-colors active:scale-95 duration-100"
          >
            <ShieldCheck size={16} />
            Sign in with Passkey / 2FA
          </button>
        </div>

        {/* Toggle Register/Login */}
        <p className="text-center text-sm text-zinc-400 mt-6">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-white font-semibold hover:underline"
          >
            {isRegister ? 'Sign In' : 'Create Account'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
