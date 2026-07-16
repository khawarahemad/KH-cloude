import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  name: string;
  email: string;
  githubUsername?: string;
  role?: string;
  discordWebhookUrl?: string;
  discordNotifyDeploys?: boolean;
  discordNotifyErrors?: boolean;
  discordNotifyDatabases?: boolean;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
}

interface AppState {
  user: User | null;
  teams: Team[];
  activeTeam: Team | null;
  activeTab: string; // 'projects' | 'databases' | 'storage' | 'billing' | 'teams' | 'audit'
  selectedProjectId: string | null;
  selectedBucketId: string | null;

  // Cache storage
  projectsCache: any[] | null;
  databasesCache: any[] | null;
  bucketsCache: any[] | null;
  billingCache: any | null;
  edgeFunctionsCache: any[] | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setTeams: (teams: Team[]) => void;
  setActiveTeam: (team: Team | null) => void;
  setActiveTab: (tab: string) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedBucketId: (id: string | null) => void;

  setProjectsCache: (val: any[] | null) => void;
  setDatabasesCache: (val: any[] | null) => void;
  setBucketsCache: (val: any[] | null) => void;
  setBillingCache: (val: any | null) => void;
  setEdgeFunctionsCache: (val: any[] | null) => void;
  
  // Helper to log out
  logout: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      teams: [],
      activeTeam: null,
      activeTab: 'projects',
      selectedProjectId: null,
      selectedBucketId: null,

      projectsCache: null,
      databasesCache: null,
      bucketsCache: null,
      billingCache: null,
      edgeFunctionsCache: null,

      setUser: (user) => set({ user }),
      setTeams: (teams) => set({ teams, activeTeam: teams.length > 0 ? teams[0] : null }),
      setActiveTeam: (activeTeam) => set({ activeTeam, projectsCache: null, databasesCache: null, bucketsCache: null, billingCache: null, edgeFunctionsCache: null }),
      setActiveTab: (activeTab) => set({ activeTab, selectedProjectId: null, selectedBucketId: null }),
      setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
      setSelectedBucketId: (selectedBucketId) => set({ selectedBucketId }),

      setProjectsCache: (projectsCache) => set({ projectsCache }),
      setDatabasesCache: (databasesCache) => set({ databasesCache }),
      setBucketsCache: (bucketsCache) => set({ bucketsCache }),
      setBillingCache: (billingCache) => set({ billingCache }),
      setEdgeFunctionsCache: (edgeFunctionsCache) => set({ edgeFunctionsCache }),
      
      logout: () => set({ 
        user: null, 
        teams: [], 
        activeTeam: null, 
        activeTab: 'projects', 
        selectedProjectId: null, 
        selectedBucketId: null,
        projectsCache: null,
        databasesCache: null,
        bucketsCache: null,
        billingCache: null,
        edgeFunctionsCache: null
      }),
    }),
    {
      name: 'kh-cloud-session',
    }
  )
);
