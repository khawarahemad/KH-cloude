import { useAppStore } from './store';

const getApiBase = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname.endsWith('khawarahemad.com')) {
      return 'https://api.khawarahemad.com/api';
    }
  }
  return 'http://localhost:5000/api';
};

const API_BASE = getApiBase();

export async function apiRequest(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;

  // Get current user and active team from store
  let userId: string | undefined;
  let teamId: string | undefined;
  try {
    const store = useAppStore.getState();
    userId = store.user?.id;
    teamId = store.activeTeam?.id;
  } catch {}

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
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
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `API error: ${res.status}`);
    }
    return await res.json();
  } catch (err: any) {
    console.warn(`API call to ${path} failed. error:`, err);
    throw err;
  }
}
