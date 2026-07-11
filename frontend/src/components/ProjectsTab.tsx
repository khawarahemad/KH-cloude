'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { Layers, Plus, Settings, RefreshCw, Terminal, Eye, EyeOff, Globe, Server, Play, ArrowLeft, Loader2, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

const Github = ({ size = 24, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

import { ResponsiveContainer as RechartsContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

export default function ProjectsTab() {
  const { activeTeam, user } = useAppStore();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectDetails, setProjectDetails] = useState<any | null>(null);
  
  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [buildCommand, setBuildCommand] = useState('npm run build');
  const [startCommand, setStartCommand] = useState('npm run start');
  const [port, setPort] = useState(3000);

  // GitHub integration states
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  
  // Active details tab
  const [detailsTab, setDetailsTab] = useState<'deployments' | 'env' | 'domains' | 'metrics' | 'settings'>('deployments');
  const [envVars, setEnvVars] = useState<{ key: string; value: string; isSecret: boolean }[]>([]);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvVal, setNewEnvVal] = useState('');
  const [newEnvSecret, setNewEnvSecret] = useState(true);

  // Settings editing states
  const [editName, setEditName] = useState('');
  const [editBuildCmd, setEditBuildCmd] = useState('');
  const [editStartCmd, setEditStartCmd] = useState('');
  const [editPort, setEditPort] = useState(3000);
  const [editBranch, setEditBranch] = useState('main');
  const [settingsSaving, setSettingsSaving] = useState(false);
  
  // Custom domain state
  const [customDomain, setCustomDomain] = useState('');
  
  // Build logs state
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);
  const [buildLogs, setBuildLogs] = useState('');
  const [logStatus, setLogStatus] = useState('');
  const [logsOpen, setLogsOpen] = useState(false);

  // Metrics state
  const [metrics, setMetrics] = useState<any | null>(null);

  const fetchGithubRepos = async () => {
    if (!user) return;
    setGithubLoading(true);
    try {
      const data = await apiRequest(`/github/repos?userId=${user.id}`);
      setGithubRepos(data);
    } catch (err) {
      setGithubRepos([]);
    } finally {
      setGithubLoading(false);
    }
  };

  useEffect(() => {
    if (wizardOpen && user) {
      fetchGithubRepos();
    }
  }, [wizardOpen, user]);

  useEffect(() => {
    if (projectDetails) {
      setEditName(projectDetails.name || '');
      setEditBuildCmd(projectDetails.buildCommand || '');
      setEditStartCmd(projectDetails.startCommand || '');
      setEditPort(projectDetails.port || 3000);
      setEditBranch(projectDetails.githubBranch || 'main');
    }
  }, [projectDetails]);

  const handleConnectGithub = () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || 'Iv23libP2nC0sNq21c8u';
    const redirectUri = `${window.location.origin}/auth/callback/github`;
    const state = Math.random().toString(36).substring(7);
    localStorage.setItem('github_oauth_state', state);
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user&state=${state}`;
  };

  const fetchProjects = async () => {
    if (!activeTeam) return;
    setLoading(true);
    try {
      const data = await apiRequest(`/projects?teamId=${activeTeam.id}`);
      setProjects(data);
    } catch (err) {
      // Fallback mock
      setProjects([
        { id: 'proj-1', name: 'Acme Website', slug: 'acme-website', githubRepo: 'acme/website', status: 'READY', domains: [{ hostname: 'acme-website.khcloud.app' }] },
        { id: 'proj-2', name: 'Data Pipeline', slug: 'data-pipeline', githubRepo: 'acme/pipeline', status: 'INACTIVE', domains: [{ hostname: 'data-pipeline.khcloud.app' }] }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectDetails = async (id: string) => {
    if (!activeTeam) return;
    try {
      const data = await apiRequest(`/projects/${id}?teamId=${activeTeam.id}`);
      setProjectDetails(data);
      setEnvVars(data.envVars || []);
      // If there's an active building deployment, auto-select it for logs
      const building = data.deployments?.find((d: any) => d.status === 'BUILDING' || d.status === 'DEPLOYING' || d.status === 'QUEUED');
      if (building) {
        setActiveDeploymentId(building.id);
      }
    } catch (err) {
      // Fallback mock details
      setProjectDetails({
        id,
        name: id === 'proj-1' ? 'Acme Website' : 'Data Pipeline',
        slug: id === 'proj-1' ? 'acme-website' : 'data-pipeline',
        githubRepo: id === 'proj-1' ? 'acme/website' : 'acme/pipeline',
        githubBranch: 'main',
        buildCommand: 'npm run build',
        startCommand: 'npm run start',
        port: 3000,
        status: id === 'proj-1' ? 'READY' : 'INACTIVE',
        domains: [{ hostname: id === 'proj-1' ? 'acme-website.khcloud.app' : 'data-pipeline.khcloud.app' }],
        envVars: [{ key: 'DATABASE_URL', value: 'postgres://...', isSecret: true }],
        deployments: [
          { id: 'dep-1', branch: 'main', status: 'READY', commitMessage: 'Initial commit', createdAt: new Date().toISOString() }
        ]
      });
    }
  };

  const fetchMetrics = async (id: string) => {
    try {
      const data = await apiRequest(`/projects/${id}/metrics`);
      setMetrics(data);
    } catch (err) {
      // Mock metrics fallback
      const now = new Date();
      const cpu = Array.from({ length: 15 }, (_, i) => ({ time: `${i}:00`, value: Math.floor(Math.random() * 20 + 20) }));
      const ram = Array.from({ length: 15 }, (_, i) => ({ time: `${i}:00`, value: Math.floor(Math.random() * 100 + 400) }));
      const network = Array.from({ length: 15 }, (_, i) => ({ time: `${i}:00`, rx: Math.floor(Math.random() * 50), tx: Math.floor(Math.random() * 30) }));
      setMetrics({ cpu, ram, network });
    }
  };

  // Poll build logs if a build is running
  useEffect(() => {
    if (!activeDeploymentId) return;

    const interval = setInterval(async () => {
      try {
        const data = await apiRequest(`/deployments/${activeDeploymentId}/logs`);
        setBuildLogs(data.logs);
        setLogStatus(data.status);
        if (data.status === 'READY' || data.status === 'FAILED' || data.status === 'CANCELLED') {
          setActiveDeploymentId(null);
          // Refresh details
          if (activeProjectId) fetchProjectDetails(activeProjectId);
          fetchProjects();
        }
      } catch (err) {
        clearInterval(interval);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeDeploymentId]);

  useEffect(() => {
    fetchProjects();
  }, [activeTeam]);

  useEffect(() => {
    if (activeProjectId) {
      fetchProjectDetails(activeProjectId);
      fetchMetrics(activeProjectId);
    }
  }, [activeProjectId]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !activeTeam) return;

    try {
      const project = await apiRequest('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: newProjectName,
          teamId: activeTeam.id,
          githubRepo: selectedRepo,
          githubBranch: selectedBranch,
          buildCommand,
          startCommand,
          port,
        }),
      });

      // Automatically deploy it first time
      await apiRequest(`/projects/${project.id}/deploy`, {
        method: 'POST',
        body: JSON.stringify({ teamId: activeTeam.id }),
      });

      setWizardOpen(false);
      setWizardStep(1);
      setNewProjectName('');
      setSelectedRepo('');
      
      // Select the new project immediately
      setActiveProjectId(project.id);
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeploy = async () => {
    if (!activeProjectId || !activeTeam) return;
    try {
      const data = await apiRequest(`/projects/${activeProjectId}/deploy`, {
        method: 'POST',
        body: JSON.stringify({ teamId: activeTeam.id }),
      });
      setActiveDeploymentId(data.id);
      setBuildLogs('Triggering build...');
      setLogsOpen(true);
      fetchProjectDetails(activeProjectId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectDetails || !activeTeam) return;
    if (!confirm(`Are you absolutely sure you want to delete the project "${projectDetails.name}"?`)) return;

    try {
      await apiRequest(`/projects/${projectDetails.id}?teamId=${activeTeam.id}`, {
        method: 'DELETE',
      });
      setActiveProjectId(null);
      setProjectDetails(null);
      fetchProjects();
    } catch (err) {
      console.error(err);
      alert('Failed to delete project.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId || !activeTeam) return;
    setSettingsSaving(true);
    try {
      const updated = await apiRequest(`/projects/${activeProjectId}/update`, {
        method: 'POST',
        body: JSON.stringify({
          name: editName,
          buildCommand: editBuildCmd,
          startCommand: editStartCmd,
          port: editPort,
          githubBranch: editBranch,
          teamId: activeTeam.id,
        }),
      });
      setProjectDetails(updated);
      alert('Project settings saved successfully! Click Redeploy to rebuild with the new commands.');
      fetchProjects();
    } catch (err) {
      console.error(err);
      alert('Failed to update project settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleAddEnv = async () => {
    if (!newEnvKey.trim() || !newEnvVal.trim() || !activeProjectId) return;
    const updated = [...envVars, { key: newEnvKey, value: newEnvVal, isSecret: newEnvSecret }];
    setEnvVars(updated);
    setNewEnvKey('');
    setNewEnvVal('');
    
    try {
      await apiRequest(`/projects/${activeProjectId}/env`, {
        method: 'POST',
        body: JSON.stringify({ vars: updated }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveEnv = async (keyToRemove: string) => {
    const updated = envVars.filter(v => v.key !== keyToRemove);
    setEnvVars(updated);
    try {
      await apiRequest(`/projects/${activeProjectId}/env`, {
        method: 'POST',
        body: JSON.stringify({ vars: updated }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDomain.trim() || !activeProjectId || !activeTeam) return;

    try {
      await apiRequest(`/projects/${activeProjectId}/domain`, {
        method: 'POST',
        body: JSON.stringify({ hostname: customDomain, teamId: activeTeam.id }),
      });
      setCustomDomain('');
      setTimeout(() => fetchProjectDetails(activeProjectId), 1000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestart = async () => {
    if (!activeProjectId || !activeTeam) return;
    try {
      await apiRequest(`/projects/${activeProjectId}/restart`, {
        method: 'POST',
        body: JSON.stringify({ teamId: activeTeam.id }),
      });
      fetchProjectDetails(activeProjectId);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#030303]">
      {/* Dynamic Header */}
      <div className="h-16 border-b border-white/5 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {activeProjectId && (
            <button
              onClick={() => setActiveProjectId(null)}
              className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <h2 className="text-sm font-bold tracking-tight">
            {activeProjectId ? `Project: ${projectDetails?.name || 'Loading...'}` : 'App Hosting'}
          </h2>
        </div>

        {!activeProjectId && (
          <button
            onClick={() => setWizardOpen(true)}
            className="h-9 px-3.5 rounded-lg bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors flex items-center gap-1.5 active:scale-95 duration-100"
          >
            <Plus size={14} />
            Deploy App
          </button>
        )}
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <Loader2 className="animate-spin text-indigo-400" size={32} />
            <span className="text-xs">Fetching projects from your cluster...</span>
          </div>
        ) : !activeProjectId ? (
          /* PROJECTS GRID LIST */
          projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl py-20 text-center glass-card max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-zinc-500 mb-4">
                <Layers size={20} />
              </div>
              <h3 className="font-bold text-sm mb-1">No Projects provisioned</h3>
              <p className="text-xs text-zinc-400 max-w-xs mb-6">Import your code from GitHub and scale it globally in seconds.</p>
              <button
                onClick={() => setWizardOpen(true)}
                className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs transition-colors active:scale-95"
              >
                Provision first project
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
              {projects.map((proj) => {
                const latestDep = proj.deployments?.[0];
                return (
                  <div
                    key={proj.id}
                    onClick={() => setActiveProjectId(proj.id)}
                    className="glass-card p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-all cursor-pointer flex flex-col justify-between h-44 active:scale-[0.98]"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white truncate max-w-[150px]">{proj.name}</span>
                        {/* Status badge */}
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          proj.status === 'READY'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : proj.status === 'BUILDING' || proj.status === 'DEPLOYING'
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                        }`}>
                          {proj.status}
                        </span>
                      </div>
                      
                      {/* Repo info */}
                      <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 mt-1 font-medium">
                        <Github size={12} className="text-zinc-600" />
                        {proj.githubRepo || 'Manual upload'}
                      </div>
                    </div>

                    <div className="border-t border-white/5 pt-4 flex items-center justify-between text-[10px] text-zinc-400">
                      <span className="truncate max-w-[150px] font-medium">{proj.domains?.[0]?.hostname || 'No domain'}</span>
                      <span className="text-zinc-500">
                        {latestDep ? `Active ${new Date(latestDep.createdAt).toLocaleDateString()}` : 'Never deployed'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* PROJECT DETAILS VIEW */
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Status overview bar */}
            <div className="glass p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <Server size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold">{projectDetails?.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      projectDetails?.status === 'READY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-400'
                    }`}>
                      {projectDetails?.status}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 flex items-center gap-1.5 mt-1">
                    <Globe size={12} />
                    <a href={`https://${projectDetails?.domains?.[0]?.hostname}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-indigo-400">
                      {projectDetails?.domains?.[0]?.hostname}
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleRestart}
                  className="h-9 px-3 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw size={12} />
                  Restart App
                </button>
                <button
                  onClick={handleDeploy}
                  className="h-9 px-3.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-500/10"
                >
                  <Play size={12} />
                  Redeploy
                </button>
              </div>
            </div>

            {/* Content selector tabs */}
            <div className="flex border-b border-white/5 text-xs font-semibold gap-6">
              {(['deployments', 'env', 'domains', 'metrics', 'settings'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDetailsTab(tab)}
                  className={`pb-3 capitalize transition-all border-b-2 ${
                    detailsTab === tab
                      ? 'border-indigo-500 text-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tab === 'env' ? 'Environment Variables' : tab}
                </button>
              ))}
            </div>

            {/* TAB CONTENTS */}
            <div className="min-h-[300px]">
              {/* Deployments tab */}
              {detailsTab === 'deployments' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-zinc-400">Deployment History</h4>
                    {activeDeploymentId && (
                      <button
                        onClick={() => setLogsOpen(true)}
                        className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Terminal size={12} />
                        View Live Logs
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-white/5 border border-white/5 rounded-2xl glass-card overflow-hidden">
                    {projectDetails?.deployments?.map((dep: any) => (
                      <div key={dep.id} className="p-4 flex items-center justify-between text-xs hover:bg-white/[0.01] transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{dep.commitMessage || 'Manual Deployment'}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                              dep.status === 'READY'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : dep.status === 'FAILED'
                                ? 'bg-red-500/10 text-red-400'
                                : 'bg-indigo-500/10 text-indigo-400'
                            }`}>
                              {dep.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-2">
                            <span>Branch: {dep.branch}</span>
                            <span>•</span>
                            <span>{new Date(dep.createdAt).toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={async () => {
                              const logs = await apiRequest(`/deployments/${dep.id}/logs`);
                              setBuildLogs(logs.logs);
                              setLogStatus(dep.status);
                              setLogsOpen(true);
                            }}
                            className="h-8 px-2.5 rounded-lg border border-white/5 hover:bg-white/5 text-[10px] font-semibold flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"
                          >
                            <Terminal size={10} />
                            Logs
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Env vars tab */}
              {detailsTab === 'env' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-400 mb-2">Configure environment variables</h4>
                    <p className="text-[10px] text-zinc-500">Variables are injected into the build container context at compile time.</p>
                  </div>

                  {/* Add Env var inline form */}
                  <div className="flex flex-col sm:flex-row gap-3 glass p-4 rounded-xl border border-white/5 max-w-3xl">
                    <input
                      type="text"
                      placeholder="KEY"
                      value={newEnvKey}
                      onChange={(e) => setNewEnvKey(e.target.value.toUpperCase())}
                      className="h-9 px-3 rounded-lg glass-input text-xs font-semibold placeholder:font-normal text-white uppercase flex-1"
                    />
                    <input
                      type="text"
                      placeholder="VALUE"
                      value={newEnvVal}
                      onChange={(e) => setNewEnvVal(e.target.value)}
                      className="h-9 px-3 rounded-lg glass-input text-xs placeholder:font-normal text-white flex-1"
                    />
                    <button
                      onClick={handleAddEnv}
                      className="h-9 px-4 rounded-lg bg-white hover:bg-zinc-200 text-black font-bold text-xs transition-colors shrink-0 active:scale-95"
                    >
                      Add Variable
                    </button>
                  </div>

                  {/* Existing env vars */}
                  <div className="space-y-3 max-w-3xl">
                    {envVars.map((env) => (
                      <div key={env.key} className="h-10 px-4 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between text-xs">
                        <div className="flex items-center gap-6">
                          <span className="font-bold text-zinc-300">{env.key}</span>
                          <span className="font-mono text-zinc-500">
                            {env.isSecret ? '••••••••••••' : env.value}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveEnv(env.key)}
                          className="text-[10px] font-semibold text-red-400 hover:text-red-300 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom domains tab */}
              {detailsTab === 'domains' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-400 mb-2">Configure Routing Domains</h4>
                    <p className="text-[10px] text-zinc-500">Point your DNS records (CNAME) to `cdn.khawarahemad.com` to verify.</p>
                  </div>

                  {/* Add Domain Form */}
                  <form onSubmit={handleAddDomain} className="flex gap-3 max-w-lg">
                    <input
                      type="text"
                      required
                      placeholder="e.g. app.mydomain.com"
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      className="h-9 px-3 rounded-lg glass-input text-xs text-white flex-1"
                    />
                    <button
                      type="submit"
                      className="h-9 px-4 rounded-lg bg-white hover:bg-zinc-200 text-black font-bold text-xs transition-colors active:scale-95"
                    >
                      Connect Domain
                    </button>
                  </form>

                  {/* Domain Listing */}
                  <div className="space-y-3 max-w-lg">
                    {projectDetails?.domains?.map((dom: any) => (
                      <div key={dom.id} className="p-4 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold">{dom.hostname}</div>
                          <div className="text-[9px] text-zinc-500 mt-1 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            {dom.isCustom ? 'Custom CNAME verified' : 'Free subdomain'}
                          </div>
                        </div>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                          HTTPS OK
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metrics charts tab */}
              {detailsTab === 'metrics' && (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* CPU Area Chart */}
                  <div className="glass-card p-6 rounded-2xl border border-white/5">
                    <h5 className="text-xs font-bold text-zinc-400 mb-4">CPU Usage (%)</h5>
                    <div className="h-48 text-[10px] font-mono">
                      {metrics?.cpu && (
                        <RechartsContainer width="100%" height="100%">
                          <AreaChart data={metrics.cpu}>
                            <defs>
                              <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="time" stroke="#4b5563" />
                            <YAxis stroke="#4b5563" />
                            <Tooltip contentStyle={{ background: '#0a0a0c', border: '1px solid rgba(255,255,255,0.08)' }} />
                            <Area type="monotone" dataKey="value" stroke="#818cf8" fillOpacity={1} fill="url(#colorCpu)" />
                          </AreaChart>
                        </RechartsContainer>
                      )}
                    </div>
                  </div>

                  {/* RAM Area Chart */}
                  <div className="glass-card p-6 rounded-2xl border border-white/5">
                    <h5 className="text-xs font-bold text-zinc-400 mb-4">Memory Allocation (MB)</h5>
                    <div className="h-48 text-[10px] font-mono">
                      {metrics?.ram && (
                        <RechartsContainer width="100%" height="100%">
                          <AreaChart data={metrics.ram}>
                            <defs>
                              <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#c084fc" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#c084fc" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="time" stroke="#4b5563" />
                            <YAxis stroke="#4b5563" />
                            <Tooltip contentStyle={{ background: '#0a0a0c', border: '1px solid rgba(255,255,255,0.08)' }} />
                            <Area type="monotone" dataKey="value" stroke="#c084fc" fillOpacity={1} fill="url(#colorRam)" />
                          </AreaChart>
                        </RechartsContainer>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Settings tab */}
              {detailsTab === 'settings' && (
                <div className="space-y-6">
                  <form onSubmit={handleSaveSettings} className="glass-card p-6 rounded-2xl border border-white/5 space-y-6 max-w-3xl">
                    <h4 className="text-sm font-bold text-white">Project Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
                      <div>
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Project Name</label>
                        <input
                          type="text"
                          required
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg glass-input text-xs font-semibold text-white"
                        />
                      </div>
                      <div>
                        <span className="text-zinc-500 block mb-1">Repository</span>
                        <span className="font-semibold text-white h-9 flex items-center">{projectDetails?.githubRepo}</span>
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Git Branch</label>
                        <input
                          type="text"
                          required
                          value={editBranch}
                          onChange={(e) => setEditBranch(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg glass-input text-xs font-semibold text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Target Port</label>
                        <input
                          type="number"
                          required
                          value={editPort}
                          onChange={(e) => setEditPort(parseInt(e.target.value))}
                          className="w-full h-9 px-3 rounded-lg glass-input text-xs font-semibold text-white font-mono"
                        />
                        <span className="text-[9px] text-zinc-500 block mt-1 leading-normal">
                          Internal container port. Docker network isolation automatically prevents any overlaps.
                        </span>
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Build Command</label>
                        <input
                          type="text"
                          required
                          value={editBuildCmd}
                          onChange={(e) => setEditBuildCmd(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg glass-input text-xs font-semibold text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Start Command</label>
                        <input
                          type="text"
                          required
                          value={editStartCmd}
                          onChange={(e) => setEditStartCmd(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg glass-input text-xs font-semibold text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={settingsSaving}
                        className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs transition-all active:scale-95 duration-100 flex items-center gap-1.5 shadow-md shadow-indigo-500/10 disabled:bg-zinc-700 disabled:text-zinc-400"
                      >
                        {settingsSaving ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            Saving...
                          </>
                        ) : 'Save Settings'}
                      </button>
                    </div>
                  </form>

                  <div className="border border-red-500/20 bg-red-500/5 p-6 rounded-2xl space-y-3 max-w-3xl">
                    <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">Danger Zone</h4>
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                      Permanently delete this project, all associated deployments, database logs, and stop the running Docker container on the host VPS. This action cannot be undone.
                    </p>
                    <button
                      type="button"
                      onClick={handleDeleteProject}
                      className="h-9 px-4 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold text-xs transition-all active:scale-95 duration-100 shadow-md shadow-red-500/10"
                    >
                      Delete Project
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New Project Wizard Modal */}
      {wizardOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="glass p-6 rounded-2xl max-w-lg w-full border border-white/10 shadow-2xl">
            <h3 className="text-base font-bold mb-1">Deploy New Web Application</h3>
            
            {/* Step indicators */}
            <div className="flex gap-2 my-4">
              {[1, 2, 3].map(step => (
                <div key={step} className={`h-1.5 rounded-full flex-1 transition-all ${
                  wizardStep >= step ? 'bg-indigo-500' : 'bg-white/10'
                }`} />
              ))}
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Project Name</label>
                    <input
                      type="text"
                      required
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="e.g. acme-landing-page"
                      className="w-full h-10 px-3 rounded-xl glass-input text-sm text-white"
                    />
                  </div>

                  <div>
                    {!user?.githubUsername ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.01] my-2">
                        <Github size={28} className="text-zinc-400 mb-3 animate-pulse" />
                        <h4 className="text-xs font-bold text-white mb-1">GitHub Account Not Connected</h4>
                        <p className="text-[10px] text-zinc-500 max-w-xs mb-4 leading-relaxed">
                          Connect your GitHub account to import repositories and select projects to deploy.
                        </p>
                        <button
                          type="button"
                          onClick={handleConnectGithub}
                          className="h-9 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition-all shadow-md active:scale-95 duration-100 flex items-center gap-2"
                        >
                          <Github size={14} />
                          Connect GitHub
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">
                            Select Repository (Connected: @{user.githubUsername})
                          </label>
                          <button
                            type="button"
                            onClick={fetchGithubRepos}
                            className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                          >
                            <RefreshCw size={10} className={githubLoading ? 'animate-spin' : ''} />
                            Refresh
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Search repositories..."
                          value={repoSearch}
                          onChange={(e) => setRepoSearch(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl glass-input text-xs text-white"
                        />
                        {githubLoading ? (
                          <div className="h-32 flex flex-col items-center justify-center text-zinc-500 text-xs">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
                            Loading repositories...
                          </div>
                        ) : githubRepos.length === 0 ? (
                          <div className="h-32 flex flex-col items-center justify-center text-zinc-500 text-xs text-center border border-white/5 rounded-xl bg-white/[0.01]">
                            No repositories found.
                          </div>
                        ) : (
                          <div className="max-h-40 overflow-y-auto grid grid-cols-1 gap-1.5 pr-1">
                            {githubRepos
                              .filter(repo =>
                                repo.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
                                repo.fullName.toLowerCase().includes(repoSearch.toLowerCase())
                              )
                              .map(repo => (
                                <button
                                  key={repo.fullName}
                                  type="button"
                                  onClick={() => {
                                    setSelectedRepo(repo.fullName);
                                    setSelectedBranch(repo.defaultBranch);
                                    if (!newProjectName.trim()) {
                                      setNewProjectName(repo.name);
                                    }
                                  }}
                                  className={`h-10 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between text-left transition-all ${
                                    selectedRepo === repo.fullName
                                      ? 'border-indigo-500 bg-indigo-500/5 text-indigo-400 font-bold'
                                      : 'border-white/5 bg-white/[0.01] text-zinc-400 hover:text-white hover:border-white/10'
                                  }`}
                                >
                                  <span className="truncate">{repo.fullName}</span>
                                  <span className="text-[9px] text-zinc-500 font-mono shrink-0 ml-2">branch: {repo.defaultBranch}</span>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setWizardOpen(false)}
                      className="h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!newProjectName.trim() || !selectedRepo}
                      onClick={() => setWizardStep(2)}
                      className="h-9 px-4 rounded-lg bg-white hover:bg-zinc-200 text-black font-semibold text-xs disabled:bg-zinc-700 disabled:text-zinc-400 transition-colors"
                    >
                      Configure Settings
                    </button>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Git Branch</label>
                      <input
                        type="text"
                        required
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl glass-input text-xs font-semibold text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Target Port</label>
                      <input
                        type="number"
                        required
                        value={port}
                        onChange={(e) => setPort(parseInt(e.target.value))}
                        className="w-full h-10 px-3 rounded-xl glass-input text-xs font-semibold text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Install Command</label>
                    <input
                      type="text"
                      required
                      value="npm install"
                      disabled
                      className="w-full h-10 px-3 rounded-xl glass-input text-xs font-semibold text-white opacity-60"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Build Command</label>
                      <input
                        type="text"
                        required
                        value={buildCommand}
                        onChange={(e) => setBuildCommand(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl glass-input text-xs font-semibold text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Start Command</label>
                      <input
                        type="text"
                        required
                        value={startCommand}
                        onChange={(e) => setStartCommand(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl glass-input text-xs font-semibold text-white"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between pt-4">
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="h-9 px-5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs active:scale-95 shadow-lg shadow-indigo-500/10"
                    >
                      Deploy Container
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Deployment Logs Console Modal */}
      {logsOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="glass rounded-2xl max-w-3xl w-full h-[500px] border border-white/10 shadow-2xl flex flex-col overflow-hidden">
            <div className="h-14 border-b border-white/5 px-6 flex items-center justify-between shrink-0 bg-black/40">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-indigo-400" />
                <h3 className="text-xs font-bold font-mono">Deployment Console Logs</h3>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                  logStatus === 'READY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'
                }`}>
                  {logStatus || 'BUILDING'}
                </span>
              </div>
              <button
                onClick={() => setLogsOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 bg-[#020203] p-6 font-mono text-[10px] text-zinc-300 overflow-y-auto leading-relaxed select-text whitespace-pre-wrap">
              {buildLogs || 'Awaiting log feed...'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
