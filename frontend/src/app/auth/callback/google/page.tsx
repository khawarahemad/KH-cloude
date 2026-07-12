'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { Loader2, ShieldAlert } from 'lucide-react';

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setTeams } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'exchanging' | 'verifying' | 'success'>('exchanging');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state') || '';

    if (!code) {
      setError('Authorization code not found from Google. Please try signing in again.');
      return;
    }

    // CSRF verification
    const savedState = localStorage.getItem('google_oauth_state');
    if (state && savedState && state !== savedState) {
      setError('CSRF validation failed. Security token mismatch. Please try again.');
      return;
    }
    localStorage.removeItem('google_oauth_state');

    const exchangeCode = async () => {
      try {
        setStatus('verifying');
        
        // Google needs the exact redirect URI sent to exchange code
        const redirectUri = `${window.location.origin}/auth/callback/google`;

        // Exchange code with backend
        const data = await apiRequest('/auth/google/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirectUri }),
        });

        // Check if we need to forward this session back to a redirected subdomain
        const redirectDest = localStorage.getItem('auth_redirect_dest');
        if (redirectDest) {
          localStorage.removeItem('auth_redirect_dest');
          const sessionPayload = encodeURIComponent(JSON.stringify(data));
          window.location.href = `${redirectDest}?session_data=${sessionPayload}`;
        } else {
          // Save session in Zustand store locally
          setUser(data.user);
          setTeams(data.teams);
          setStatus('success');
          router.push('/');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to authenticate with Google.');
      }
    };

    exchangeCode();
  }, [searchParams, setUser, setTeams, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#030303] text-white flex flex-col justify-center items-center px-6 font-sans">
        <div className="w-full max-w-md p-8 bg-[#111318] border border-red-500/20 rounded-2xl text-center flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30 text-red-400">
            <ShieldAlert size={24} />
          </div>
          <h2 className="text-xl font-bold text-white">Google Auth Error</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full h-10 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-sm transition-colors active:scale-95 duration-100 mt-2"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030303] text-white flex flex-col justify-center items-center px-6 font-sans">
      <div className="w-full max-w-md p-8 bg-[#111318] border border-white/10 rounded-2xl text-center flex flex-col items-center gap-5">
        <div className="relative">
          <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
          <div className="absolute inset-0 w-10 h-10 rounded-full border border-violet-500/20 pointer-events-none" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Connecting to Google</h2>
          <p className="text-xs text-zinc-400">
            {status === 'exchanging' ? 'Exchanging authentication token...' : 'Retrieving profile details...'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#030303] text-white flex flex-col justify-center items-center px-6 font-sans">
        <div className="w-full max-w-md p-8 bg-[#111318] border border-white/10 rounded-2xl text-center flex flex-col items-center gap-5">
          <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
          <h2 className="text-lg font-bold text-white mb-1">Loading Google session...</h2>
        </div>
      </div>
    }>
      <GoogleCallbackContent />
    </Suspense>
  );
}
