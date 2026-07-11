import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  name: string;
  email: string;
  githubUsername?: string;
  role?: string;
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
  
  // Actions
  setUser: (user: User | null) => void;
  setTeams: (teams: Team[]) => void;
  setActiveTeam: (team: Team | null) => void;
  setActiveTab: (tab: string) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedBucketId: (id: string | null) => void;
  
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

      setUser: (user) => set({ user }),
      setTeams: (teams) => set({ teams, activeTeam: teams.length > 0 ? teams[0] : null }),
      setActiveTeam: (activeTeam) => set({ activeTeam }),
      setActiveTab: (activeTab) => set({ activeTab, selectedProjectId: null, selectedBucketId: null }),
      setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
      setSelectedBucketId: (selectedBucketId) => set({ selectedBucketId }),
      
      logout: () => set({ user: null, teams: [], activeTeam: null, activeTab: 'projects', selectedProjectId: null, selectedBucketId: null }),
    }),
    {
      name: 'kh-cloud-session',
    }
  )
);
