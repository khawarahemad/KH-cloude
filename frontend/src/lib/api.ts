import { useAppStore } from './store';

export const getBaseDomain = (): string => {
  if (process.env.NEXT_PUBLIC_BASE_DOMAIN) {
    return process.env.NEXT_PUBLIC_BASE_DOMAIN;
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'localhost';
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return hostname;
  }
  return 'khawarahemad.com';
};

export const getDomainUrl = (subdomain: 'cloud' | 'api' | 'auth' | 'admin' | 'storage' | 's3' | 'cdn'): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      if (subdomain === 'api') return 'http://localhost:5000/api';
      if (subdomain === 'storage') return 'http://localhost:5000';
      if (subdomain === 's3') return 'http://localhost:9000';
      return 'http://localhost:3000';
    }
    const base = getBaseDomain();
    if (subdomain === 'api') return `https://api.${base}/api`;
    return `https://${subdomain}.${base}`;
  }
  const base = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'khawarahemad.com';
  if (subdomain === 'api') return `https://api.${base}/api`;
  return `https://${subdomain}.${base}`;
};

export const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    const raw = process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
    return raw.endsWith('/api') ? raw : `${raw}/api`;
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5000/api';
    }
    const base = getBaseDomain();
    return `https://api.${base}/api`;
  }
  return 'http://localhost:5000/api';
};

export const API_BASE = getApiBase();

export async function apiRequest(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;

  // Get current user, active team, and access token from store
  let userId: string | undefined;
  let teamId: string | undefined;
  let accessToken: string | null = null;
  try {
    const store = useAppStore.getState();
    userId = store.user?.id;
    teamId = store.activeTeam?.id;
    accessToken = store.accessToken;
  } catch {}

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
    ...(userId ? { 'x-user-id': userId } : {}),
    ...(teamId ? { 'x-team-id': teamId } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  // If body is FormData, delete Content-Type so browser sets boundary automatically
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      if (res.status === 401) {
        useAppStore.getState().logout();
      }
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `API error: ${res.status}`);
    }
    return await res.json();
  } catch (err: any) {
    console.warn(`API call to ${path} failed. error:`, err);
    throw err;
  }
}
