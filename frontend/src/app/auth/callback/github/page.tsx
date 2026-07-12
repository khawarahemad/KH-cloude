'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { Loader2, ShieldAlert } from 'lucide-react';

function GitHubCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setTeams } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'exchanging' | 'verifying' | 'success'>('exchanging');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state') || '';
    const sessionDataParam = searchParams.get('session_data');

    // Case 1: We are on the target subdomain receiving session data forwarded from the callback domain
    if (sessionDataParam) {
      const savedState = localStorage.getItem('github_oauth_state');
      const cleanedState = state.replace('_admin', '');
      const cleanedSavedState = savedState ? savedState.replace('_admin', '').replace('_cloud', '') : '';
      
      if (savedState && cleanedState !== cleanedSavedState) {
        setError('CSRF validation failed on redirect. Security token mismatch.');
        return;
      }
      localStorage.removeItem('github_oauth_state');

      try {
        const data = JSON.parse(decodeURIComponent(sessionDataParam));
        setUser(data.user);
        setTeams(data.teams);
        setStatus('success');
        router.push('/');
        return;
      } catch (e) {
        setError('Failed to parse forwarded session.');
        return;
      }
    }

    if (!code) {
      setError('Authorization code not found. Please try logging in again.');
      return;
    }

    // Case 2: We are on the callback domain (cloud.khawarahemad.com)
    const isForwardedToAdmin = state.endsWith('_admin');
    if (!isForwardedToAdmin) {
      const savedState = localStorage.getItem('github_oauth_state');
      const cleanedState = state.replace('_cloud', '');
      const cleanedSavedState = savedState ? savedState.replace('_cloud', '').replace('_admin', '') : '';
      if (savedState && cleanedState !== cleanedSavedState) {
        setError('CSRF validation failed. Security token mismatch. Please try again.');
        return;
      }
      localStorage.removeItem('github_oauth_state');
    }

    const exchangeCode = async () => {
      try {
        setStatus('verifying');
        
        // Exchange code with backend
        const data = await apiRequest('/auth/github/callback', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });

        if (isForwardedToAdmin) {
          // Forward session data to admin subdomain
          window.location.href = `https://admin.khawarahemad.com/auth/callback/github?session_data=${encodeURIComponent(JSON.stringify(data))}&state=${state}`;
        } else {
          // Save session in Zustand store locally
          setUser(data.user);
          setTeams(data.teams);
          setStatus('success');
          router.push('/');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to authenticate with GitHub.');
      }
    };

    exchangeCode();
  }, [searchParams, setUser, setTeams, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#030303] text-white flex flex-col justify-center items-center px-6 font-sans">
        <div className="w-full max-w-md p-8 glass border border-red-500/20 rounded-2xl text-center flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30 text-red-400">
            <ShieldAlert size={24} />
          </div>
          <h2 className="text-xl font-bold text-white">Authentication Error</h2>
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
      <div className="w-full max-w-md p-8 glass border border-white/10 rounded-2xl text-center flex flex-col items-center gap-5">
        <div className="relative">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          <div className="absolute inset-0 w-10 h-10 rounded-full border border-indigo-500/20 pointer-events-none" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Connecting to GitHub</h2>
          <p className="text-xs text-zinc-400">
            {status === 'exchanging' ? 'Exchanging authentication token...' : 'Retrieving profile details...'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#030303] text-white flex flex-col justify-center items-center px-6 font-sans">
        <div className="w-full max-w-md p-8 glass border border-white/10 rounded-2xl text-center flex flex-col items-center gap-5">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          <h2 className="text-lg font-bold text-white">Loading Auth Callback...</h2>
        </div>
      </div>
    }>
      <GitHubCallbackContent />
    </Suspense>
  );
}
