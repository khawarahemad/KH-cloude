const getApiBase = () => {
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'cloud.khawarahemad.com') {
      return 'https://api.khawarahemad.com/api';
    }
  }
  return 'http://localhost:5000/api';
};

const API_BASE = getApiBase();

export async function apiRequest(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `API error: ${res.status}`);
    }
    return await res.json();
  } catch (err: any) {
    console.warn(`API call to ${path} failed, using local simulation. error:`, err);
    throw err;
  }
}
