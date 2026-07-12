'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Key, ShieldCheck, ArrowLeft, Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { apiRequest } from '@/lib/api';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

const GithubIcon = ({ size = 16, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...props}>
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
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
  const [showPassword, setShowPassword] = useState(false);
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
    <div style={{ minHeight: '100vh', backgroundColor: '#0b0d11', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }}>
      
      {/* Background gradient */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(124,58,237,0.08), transparent)',
      }} />

      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          position: 'absolute', top: '20px', left: '20px',
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          height: '32px', padding: '0 12px',
          borderRadius: '8px',
          backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.09)',
          color: '#9ba3af', fontSize: '13px', fontWeight: 500,
          cursor: 'pointer', transition: 'all 0.12s',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.backgroundColor = '#1e222c';
          el.style.color = '#f1f3f6';
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.backgroundColor = '#181b22';
          el.style.color = '#9ba3af';
        }}
      >
        <ArrowLeft size={13} /> Back
      </button>

      {/* Auth card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        style={{
          width: '100%', maxWidth: '400px',
          backgroundColor: '#111318',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          position: 'relative',
        }}
      >
        {/* Top accent line */}
        <div style={{
          position: 'absolute', top: 0, left: '20%', right: '20%',
          height: '1px', background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.6), transparent)',
        }} />

        {/* Logo + Title */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img
            src="/logo.png"
            alt="KH Cloud"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '11px',
              margin: '0 auto 16px',
            }}
          />
          <h1 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.025em', color: '#f1f3f6', marginBottom: '6px' }}>
            {isRegister ? 'Create your account' : 'Welcome back'}
          </h1>
          <p style={{ fontSize: '13px', color: '#6b7280' }}>
            {isRegister
              ? 'Sign up to start deploying with KH Cloud'
              : 'Sign in to your KH Cloud workspace'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: '16px', padding: '10px 14px',
            backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '8px', fontSize: '13px', color: '#fca5a5',
          }}>
            {error}
          </div>
        )}

        {/* OAuth buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginBottom: '20px' }}>
          <button
            onClick={() => handleOAuthSimulate('GitHub')}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              height: '36px', borderRadius: '8px',
              backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.1)',
              color: '#d1d5db', fontSize: '13px', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = '#1e222c';
              el.style.borderColor = 'rgba(255,255,255,0.18)';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = '#181b22';
              el.style.borderColor = 'rgba(255,255,255,0.1)';
            }}
          >
            <GithubIcon size={14} /> GitHub
          </button>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.07)' }} />
          <span style={{ fontSize: '11px', color: '#4b5563', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>or</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.07)' }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <AnimatePresence mode="popLayout">
            {isRegister && (
              <motion.div
                key="name-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <label className="rw-label">Full name</label>
                <div style={{ position: 'relative' }}>
                  <User size={13} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#4b5563' }} />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="rw-input"
                    style={{ paddingLeft: '32px' }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label className="rw-label">Email address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={13} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#4b5563' }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="rw-input"
                style={{ paddingLeft: '32px' }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label className="rw-label" style={{ margin: 0 }}>Password</label>
              {!isRegister && (
                <button
                  type="button"
                  style={{ fontSize: '12px', color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={13} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#4b5563' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="rw-input"
                style={{ paddingLeft: '32px', paddingRight: '36px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#4b5563', display: 'flex', alignItems: 'center',
                  padding: '2px',
                }}
              >
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              height: '38px', borderRadius: '8px', marginTop: '4px',
              backgroundColor: '#7c3aed',
              border: '1px solid rgba(124,58,237,0.5)',
              color: '#fff', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
              transition: 'all 0.15s',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading
              ? <><Loader2 size={13} className="animate-spin" /> {isRegister ? 'Creating...' : 'Signing in...'}</>
              : <>{isRegister ? 'Create account' : 'Sign in'} <ArrowRight size={13} /></>
            }
          </button>
        </form>

        {/* Passkey option */}
        <button
          onClick={() => handleOAuthSimulate('Passkey')}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            width: '100%', height: '36px', marginTop: '10px',
            borderRadius: '8px',
            backgroundColor: 'transparent',
            border: '1px dashed rgba(124,58,237,0.3)',
            color: '#9ba3af', fontSize: '13px', fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.12s',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = 'rgba(124,58,237,0.5)';
            el.style.color = '#c4b5fd';
            el.style.backgroundColor = 'rgba(124,58,237,0.06)';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = 'rgba(124,58,237,0.3)';
            el.style.color = '#9ba3af';
            el.style.backgroundColor = 'transparent';
          }}
        >
          <ShieldCheck size={13} /> Sign in with passkey
        </button>

        {/* Toggle register/login */}
        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: '#6b7280' }}>
          {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          <button
            onClick={() => { setIsRegister(!isRegister); setError(null); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa', fontWeight: 600, fontSize: '13px' }}
          >
            {isRegister ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
