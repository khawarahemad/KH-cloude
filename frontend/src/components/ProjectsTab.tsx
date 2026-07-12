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

const parseEnvText = (text: string) => {
  const lines = text.split('\n');
  const parsed: { key: string; value: string; isSecret: boolean }[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      let value = trimmed.substring(eqIdx + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      parsed.push({ key, value, isSecret: true });
    }
  }
  return parsed;
};

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
  const [installCommand, setInstallCommand] = useState('npm install');
  const [port, setPort] = useState(3000);
  const [rootDir, setRootDir] = useState('');
  const [rawEnvText, setRawEnvText] = useState('');
  const [parsedEnvVars, setParsedEnvVars] = useState<{ key: string; value: string; isSecret: boolean }[]>([]);

  useEffect(() => {
    setParsedEnvVars(parseEnvText(rawEnvText));
  }, [rawEnvText]);

  // GitHub integration states
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  
  // Active details tab
  const [detailsTab, setDetailsTab] = useState<'deployments' | 'env' | 'domains' | 'metrics' | 'console' | 'terminal' | 'settings'>('deployments');
  const [runtimeLogs, setRuntimeLogs] = useState('Fetching runtime logs...');
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalHistory, setTerminalHistory] = useState<string[]>([
    'Welcome to KH Cloud Interactive Terminal.',
    'Commands are executed directly inside your running container context.',
    'Try typing: ls -la, python --version, or env',
    ''
  ]);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [envVars, setEnvVars] = useState<{ key: string; value: string; isSecret: boolean }[]>([]);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvVal, setNewEnvVal] = useState('');
  const [newEnvSecret, setNewEnvSecret] = useState(true);

  // Settings editing states
  const [editName, setEditName] = useState('');
  const [editBuildCmd, setEditBuildCmd] = useState('');
  const [editStartCmd, setEditStartCmd] = useState('');
  const [editInstallCmd, setEditInstallCmd] = useState('');
  const [editPort, setEditPort] = useState(3000);
  const [editBranch, setEditBranch] = useState('main');
  const [editRootDir, setEditRootDir] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [detectingProject, setDetectingProject] = useState(false);

  // Env vars UI state
  const [envSaving, setEnvSaving] = useState(false);
  const [envSaved, setEnvSaved] = useState(false);
  const [envRevealedKeys, setEnvRevealedKeys] = useState<Set<string>>(new Set());
  const [envEditingKey, setEnvEditingKey] = useState<string | null>(null);
  const [envEditVal, setEnvEditVal] = useState('');
  const [envBulkMode, setEnvBulkMode] = useState(false);
  const [envBulkText, setEnvBulkText] = useState('');

  const toggleReveal = (key: string) => {
    setEnvRevealedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const saveEnvVars = async (vars: typeof envVars) => {
    if (!activeProjectId) return;
    setEnvSaving(true);
    setEnvSaved(false);
    try {
      await apiRequest(`/projects/${activeProjectId}/env`, {
        method: 'POST',
        body: JSON.stringify({ vars }),
      });
      setEnvSaved(true);
      setTimeout(() => setEnvSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setEnvSaving(false);
    }
  };

  // Deletion modal states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  
  // Custom domain state
  const [customDomain, setCustomDomain] = useState('');
  const [domainAdding, setDomainAdding] = useState(false);
  const [domainError, setDomainError] = useState('');
  const [removingDomainId, setRemovingDomainId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getDomainType = (d: string) => {
    if (!d) return null;
    const parts = d.replace(/^https?:\/\//, '').split('.');
    if (parts.length === 2) return 'apex';
    if (parts[0] === 'www') return 'www';
    return 'subdomain';
  };
  
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
      setEditInstallCmd(projectDetails.installCommand || '');
      setEditPort(projectDetails.port || 3000);
      setEditBranch(projectDetails.githubBranch || 'main');
      setEditRootDir(projectDetails.rootDirectory || '');
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

  const fetchRuntimeLogs = async () => {
    if (!activeProjectId || !activeTeam) return;
    try {
      const res = await apiRequest(`/projects/${activeProjectId}/runtime-logs?teamId=${activeTeam.id}`);
      setRuntimeLogs(res.logs || 'No logs returned from container.');
    } catch (err) {
      setRuntimeLogs('Error fetching runtime logs. Make sure the project is active and running.');
    }
  };

  useEffect(() => {
    if (detailsTab !== 'console' || !activeProjectId || !activeTeam) return;
    fetchRuntimeLogs();
    const interval = setInterval(fetchRuntimeLogs, 3000);
    return () => clearInterval(interval);
  }, [detailsTab, activeProjectId, activeTeam]);

  const handleTerminalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim() || !activeProjectId || !activeTeam || terminalRunning) return;
    const cmd = terminalInput.trim();
    setTerminalInput('');
    setTerminalHistory(prev => [...prev, `$ ${cmd}`]);
    setTerminalRunning(true);
    try {
      const res = await apiRequest(`/projects/${activeProjectId}/terminal`, {
        method: 'POST',
        body: JSON.stringify({ command: cmd, teamId: activeTeam.id })
      });
      setTerminalHistory(prev => [...prev, res.output]);
    } catch (err: any) {
      setTerminalHistory(prev => [...prev, `Error: ${err.message || 'Failed to execute command'}`]);
    } finally {
      setTerminalRunning(false);
    }
  };

  const handleConfigureSettings = async () => {
    if (!selectedRepo || !user) return;
    setDetectingProject(true);
    try {
      const res = await apiRequest(
        `/github/repos/detect?userId=${user.id}&repo=${selectedRepo}&branch=${selectedBranch}&rootDir=${rootDir}`
      );
      setPort(res.port);
      setBuildCommand(res.buildCommand);
      setStartCommand(res.startCommand);
      setInstallCommand(res.installCommand);
      setWizardStep(2);
    } catch (err) {
      setPort(3000);
      setBuildCommand('npm run build');
      setStartCommand('npm run start');
      setInstallCommand('npm install');
      setWizardStep(2);
    } finally {
      setDetectingProject(false);
    }
  };

  const reDetectProjectConfig = async () => {
    if (!selectedRepo || !user) return;
    setDetectingProject(true);
    try {
      const res = await apiRequest(
        `/github/repos/detect?userId=${user.id}&repo=${selectedRepo}&branch=${selectedBranch}&rootDir=${rootDir}`
      );
      setPort(res.port);
      setBuildCommand(res.buildCommand);
      setStartCommand(res.startCommand);
      setInstallCommand(res.installCommand);
    } catch (err) {
      // ignore
    } finally {
      setDetectingProject(false);
    }
  };

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
          rootDirectory: rootDir.trim(),
           buildCommand,
          startCommand,
          installCommand,
          port,
          envVars: parsedEnvVars,
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
      setRootDir('');
      setRawEnvText('');
      
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

  const handleDeleteProject = () => {
    setDeleteConfirmInput('');
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteProject = async () => {
    if (!projectDetails || !activeTeam) return;
    try {
      await apiRequest(`/projects/${projectDetails.id}?teamId=${activeTeam.id}`, {
        method: 'DELETE',
      });
      setDeleteConfirmOpen(false);
      setDeleteConfirmInput('');
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
          installCommand: editInstallCmd,
          port: editPort,
          githubBranch: editBranch,
          rootDirectory: editRootDir.trim(),
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
    const key = newEnvKey.trim().toUpperCase();
    if (envVars.find(v => v.key === key)) return; // no duplicates
    const updated = [...envVars, { key, value: newEnvVal.trim(), isSecret: newEnvSecret }];
    setEnvVars(updated);
    setNewEnvKey('');
    setNewEnvVal('');
    await saveEnvVars(updated);
  };

  const handleRemoveEnv = async (keyToRemove: string) => {
    const updated = envVars.filter(v => v.key !== keyToRemove);
    setEnvVars(updated);
    await saveEnvVars(updated);
  };

  const handleUpdateEnvValue = async (key: string, newVal: string) => {
    const updated = envVars.map(v => v.key === key ? { ...v, value: newVal } : v);
    setEnvVars(updated);
    setEnvEditingKey(null);
    await saveEnvVars(updated);
  };

  const handleBulkPaste = async () => {
    const lines = envBulkText.split('\n');
    const parsed: { key: string; value: string; isSecret: boolean }[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const k = trimmed.slice(0, eqIdx).trim().toUpperCase();
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (k) parsed.push({ key: k, value: v, isSecret: true });
    }
    if (!parsed.length) return;
    // Merge: overwrite existing keys, add new ones
    const merged = [...envVars];
    for (const p of parsed) {
      const idx = merged.findIndex(v => v.key === p.key);
      if (idx >= 0) merged[idx] = p;
      else merged.push(p);
    }
    setEnvVars(merged);
    setEnvBulkText('');
    setEnvBulkMode(false);
    await saveEnvVars(merged);
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = customDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!h || !activeProjectId || !activeTeam) return;
    setDomainError('');
    setDomainAdding(true);
    try {
      await apiRequest(`/projects/${activeProjectId}/domain`, {
        method: 'POST',
        body: JSON.stringify({ hostname: h, teamId: activeTeam.id }),
      });
      setCustomDomain('');
      await fetchProjectDetails(activeProjectId);
    } catch (err: any) {
      setDomainError(err?.message || 'Failed to add domain. Please try again.');
    } finally {
      setDomainAdding(false);
    }
  };

  const handleRemoveDomain = async (domainId: string) => {
    if (!activeProjectId || !activeTeam) return;
    setRemovingDomainId(domainId);
    try {
      await apiRequest(`/projects/${activeProjectId}/domain/${domainId}`, {
        method: 'DELETE',
        body: JSON.stringify({ teamId: activeTeam.id }),
      });
      await fetchProjectDetails(activeProjectId);
    } catch (err) {
      console.error(err);
    } finally {
      setRemovingDomainId(null);
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
    <div className="rw-page">
      {/* Dynamic Header */}
      <div className="rw-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeProjectId && (
            <button
              onClick={() => setActiveProjectId(null)}
              style={{ width: '30px', height: '30px', borderRadius: '7px', backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ba3af', cursor: 'pointer' }}
            >
              <ArrowLeft size={13} />
            </button>
          )}
          <div>
            <h1 className="rw-page-title" style={{ fontSize: activeProjectId ? '16px' : '20px' }}>
              {activeProjectId ? projectDetails?.name || 'Loading...' : 'Deployments'}
            </h1>
            <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
              {activeProjectId ? 'Manage runtime, domains, environment, and deployments.' : 'Create, ship, and observe production apps from one workspace.'}
            </p>
          </div>
        </div>
        {!activeProjectId && (
          <button onClick={() => setWizardOpen(true)} className="rw-btn rw-btn-primary">
            <Plus size={13} /> Deploy app
          </button>
        )}
      </div>

      {/* Main View Area */}
      <div className="rw-page-content">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', gap: '12px', color: '#6b7280' }}>
            <Loader2 size={18} className="animate-spin" style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: '13px' }}>Loading projects...</span>
          </div>
        ) : !activeProjectId ? (
          projects.length === 0 ? (
            <div className="rw-empty">
              <div className="rw-empty-icon"><Layers size={20} style={{ color: '#6b7280' }} /></div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f3f6' }}>No projects yet</h3>
              <p style={{ fontSize: '13px', color: '#6b7280', maxWidth: '320px' }}>Import code from GitHub, configure the runtime, and launch a production-ready app in one flow.</p>
              <button onClick={() => setWizardOpen(true)} className="rw-btn rw-btn-primary rw-btn-lg" style={{ marginTop: '4px' }}><Plus size={14} /> Deploy first app</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
              {projects.map((proj) => {
                const latestDep = proj.deployments?.[0];
                const statusColors = proj.status === 'READY'
                  ? { bg: 'rgba(34,197,94,0.1)', color: '#22c55e', border: 'rgba(34,197,94,0.2)' }
                  : (proj.status === 'BUILDING' || proj.status === 'DEPLOYING')
                  ? { bg: 'rgba(124,58,237,0.1)', color: '#a78bfa', border: 'rgba(124,58,237,0.2)' }
                  : { bg: '#181b22', color: '#6b7280', border: 'rgba(255,255,255,0.07)' };
                return (
                  <div key={proj.id} onClick={() => setActiveProjectId(proj.id)} className="rw-card-interactive" style={{ padding: '16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#f1f3f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>{proj.name}</span>
                      <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '10px', fontWeight: 500, backgroundColor: statusColors.bg, color: statusColors.color, border: `1px solid ${statusColors.border}`, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {proj.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#4b5563', marginBottom: '14px' }}>
                      <Github size={11} style={{ color: '#6b7280' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.githubRepo || 'Manual upload'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '11px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px', color: '#9ba3af' }}>{proj.domains?.[0]?.hostname || 'No domain'}</span>
                      <span style={{ color: '#4b5563', flexShrink: 0 }}>
                        {latestDep ? new Date(latestDep.createdAt).toLocaleDateString() : 'Never deployed'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* PROJECT DETAILS VIEW */
            <div className="mx-auto max-w-6xl space-y-6">
            {/* Status overview bar */}
            <div className="app-panel-strong flex flex-col items-start justify-between gap-6 rounded-[1.75rem] p-6 md:flex-row md:items-center">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-violet-300">
                  <Server size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">{projectDetails?.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      projectDetails?.status === 'READY' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-500/10 text-slate-400'
                    }`}>
                      {projectDetails?.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                    <Globe size={12} />
                    <a href={`https://${projectDetails?.domains?.[0]?.hostname}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-violet-300">
                      {projectDetails?.domains?.[0]?.hostname}
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={handleRestart} className="app-button-secondary h-11 px-4 text-xs">
                  <RefreshCw size={12} />
                  Restart App
                </button>
                <button
                  onClick={handleDeploy}
                  className="app-button-primary h-11 px-4 text-xs"
                >
                  <Play size={12} />
                  Redeploy
                </button>
              </div>
            </div>

            {/* Content selector tabs */}
            <div className="flex flex-wrap gap-2 border-b border-white/10 text-xs font-semibold">
              {(['deployments', 'env', 'domains', 'metrics', 'console', 'terminal', 'settings'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDetailsTab(tab)}
                  className={`rounded-full px-4 py-2 capitalize transition-all ${
                    detailsTab === tab
                      ? 'bg-purple-500/10 text-violet-100 ring-1 ring-purple-500/20'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {tab === 'env' ? 'Environment Variables' : tab === 'console' ? 'Runtime Logs' : tab === 'terminal' ? 'Interactive Terminal' : tab}
                </button>
              ))}
            </div>

            {/* TAB CONTENTS */}
            <div className="min-h-[300px]">
              {/* Deployments tab */}
              {detailsTab === 'deployments' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500">Deployment history</h4>
                    {activeDeploymentId && (
                      <button
                        onClick={() => setLogsOpen(true)}
                        className="text-xs text-violet-300 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Terminal size={12} />
                        View Live Logs
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-white/10 border border-white/10 rounded-2xl app-panel overflow-hidden">
                    {projectDetails?.deployments?.map((dep: any) => (
                      <div key={dep.id} className="p-4 flex items-center justify-between text-xs hover:bg-white/[0.01] transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{dep.commitMessage || 'Manual Deployment'}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                              dep.status === 'READY'
                                ? 'bg-emerald-500/10 text-emerald-300'
                                : dep.status === 'FAILED'
                                ? 'bg-red-500/10 text-red-300'
                                : 'bg-purple-500/10 text-violet-300'
                            }`}>
                              {dep.status}
                            </span>
                          </div>
                            <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
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
                            className="app-button-secondary h-8 px-2.5 text-[10px]"
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
                <div className="space-y-5">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1">Environment variables</h4>
                      <p className="text-[10px] text-slate-500">Injected into your container at runtime. Redeploy after changes.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEnvBulkMode(!envBulkMode); setEnvBulkText(''); }}
                        className={`h-7 px-3 rounded-lg text-[10px] font-semibold border transition-all ${
                          envBulkMode
                            ? 'bg-purple-500/10 border-purple-500/20 text-violet-300'
                              : 'border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                        }`}
                      >
                        {envBulkMode ? '✕ Cancel Paste' : '⊞ Bulk Paste .env'}
                      </button>
                      {envVars.length > 0 && (
                        <button
                          onClick={() => saveEnvVars(envVars)}
                          disabled={envSaving}
                          className="h-7 px-3 rounded-lg text-[10px] font-bold bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50 transition-all flex items-center gap-1.5"
                        >
                          {envSaving ? (
                            <><span className="w-2.5 h-2.5 border border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />Saving...</>
                          ) : envSaved ? (
                            <>✓ Saved</>
                          ) : (
                            <>↑ Save All</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bulk paste mode */}
                  {envBulkMode && (
                    <div className="space-y-2 max-w-2xl">
                      <div className="text-[9px] text-slate-500">Paste your <code className="bg-white/5 px-1 rounded text-slate-200">.env</code> file contents below. Existing keys will be overwritten.</div>
                      <textarea
                        value={envBulkText}
                        onChange={e => setEnvBulkText(e.target.value)}
                        rows={8}
                        placeholder={`DATABASE_URL=postgres://...\nSECRET_KEY=abc123\nNODE_ENV=production`}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-xs font-mono text-slate-300 placeholder-slate-700 focus:outline-none focus:border-purple-500/40 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleBulkPaste}
                          disabled={!envBulkText.trim()}
                          className="app-button-primary h-8 px-4 text-xs disabled:opacity-40"
                        >
                          Import Variables
                        </button>
                        <button
                          onClick={() => { setEnvBulkMode(false); setEnvBulkText(''); }}
                          className="app-button-secondary h-8 px-4 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Add new variable row */}
                  {!envBulkMode && (
                    <div className="flex gap-2 max-w-2xl items-start">
                      <div className="flex-1">
                        <div className="text-[8px] text-slate-600 mb-1 ml-1">KEY</div>
                        <input
                          type="text"
                          placeholder="VARIABLE_NAME"
                          value={newEnvKey}
                          onChange={(e) => setNewEnvKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                          className="w-full h-9 px-3 rounded-xl bg-slate-950/70 border border-white/10 text-xs font-mono font-bold text-white placeholder-slate-700 focus:outline-none focus:border-purple-500/40 transition-colors uppercase"
                        />
                      </div>
                      <div className="flex-[2]">
                        <div className="text-[8px] text-slate-600 mb-1 ml-1">VALUE</div>
                        <input
                          type={newEnvSecret ? 'password' : 'text'}
                          placeholder="value"
                          value={newEnvVal}
                          onChange={(e) => setNewEnvVal(e.target.value)}
                          className="w-full h-9 px-3 rounded-xl bg-slate-950/70 border border-white/10 text-xs font-mono text-white placeholder-slate-700 focus:outline-none focus:border-purple-500/40 transition-colors"
                        />
                      </div>
                      <div className="flex flex-col gap-1 items-center pt-[18px]">
                        <button
                          type="button"
                          onClick={() => setNewEnvSecret(!newEnvSecret)}
                          title={newEnvSecret ? 'Value is hidden' : 'Value is visible'}
                          className={`w-9 h-9 rounded-xl border text-sm transition-all ${
                            newEnvSecret
                              ? 'bg-purple-500/10 border-purple-500/20 text-violet-300'
                              : 'border-white/10 text-slate-500 hover:text-white'
                          }`}
                        >
                          {newEnvSecret ? '🔒' : '👁'}
                        </button>
                      </div>
                      <div className="pt-[18px]">
                        <button
                          onClick={handleAddEnv}
                          disabled={!newEnvKey.trim() || !newEnvVal.trim()}
                          className="app-button-primary h-9 px-4 text-xs disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Variable list */}
                  {!envBulkMode && (
                    <div className="space-y-1.5 max-w-2xl">
                      {envVars.length === 0 && (
                        <div className="text-center py-8 text-[10px] text-slate-600">
                          No environment variables configured yet.
                        </div>
                      )}
                      {envVars.map((env) => (
                        <div key={env.key} className="group rounded-xl border border-white/10 bg-white/[0.015] hover:border-white/15 transition-colors overflow-hidden">
                          <div className="flex items-center h-11 px-3 gap-3">
                            {/* Secret badge */}
                            <span className={`text-[8px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${
                              env.isSecret ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-700/50 text-slate-500'
                            }`}>
                              {env.isSecret ? 'SECRET' : 'PLAIN'}
                            </span>

                            {/* Key */}
                            <span className="font-mono font-bold text-xs text-slate-200 flex-shrink-0 w-44 truncate">{env.key}</span>

                            {/* Value / edit */}
                            {envEditingKey === env.key ? (
                              <div className="flex-1 flex gap-2">
                                <input
                                  autoFocus
                                  type="text"
                                  value={envEditVal}
                                  onChange={e => setEnvEditVal(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleUpdateEnvValue(env.key, envEditVal);
                                    if (e.key === 'Escape') setEnvEditingKey(null);
                                  }}
                                  className="flex-1 h-7 px-2 rounded-lg bg-slate-950/70 border border-purple-500/30 text-xs font-mono text-white focus:outline-none"
                                />
                                <button onClick={() => handleUpdateEnvValue(env.key, envEditVal)} className="h-7 px-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-bold hover:bg-emerald-500/20">
                                  Save
                                </button>
                                <button onClick={() => setEnvEditingKey(null)} className="h-7 px-2 rounded-lg border border-white/10 text-slate-500 text-[10px] hover:text-white">
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div className="flex-1 flex items-center gap-2 min-w-0">
                                <span className="font-mono text-xs text-slate-500 truncate flex-1">
                                  {envRevealedKeys.has(env.key) ? env.value : (env.isSecret ? '••••••••••••' : env.value)}
                                </span>
                              </div>
                            )}

                            {/* Action buttons — visible on hover */}
                            {envEditingKey !== env.key && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                {env.isSecret && (
                                  <button
                                    onClick={() => toggleReveal(env.key)}
                                    title={envRevealedKeys.has(env.key) ? 'Hide value' : 'Reveal value'}
                                    className="h-7 w-7 rounded-lg border border-white/10 text-slate-500 hover:text-white text-sm flex items-center justify-center transition-colors"
                                  >
                                    {envRevealedKeys.has(env.key) ? '🙈' : '👁'}
                                  </button>
                                )}
                                <button
                                  onClick={() => { setEnvEditingKey(env.key); setEnvEditVal(env.value); }}
                                  className="h-7 px-2 rounded-lg border border-white/10 text-slate-500 hover:text-white text-[9px] font-bold transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleRemoveEnv(env.key)}
                                  className="h-7 px-2 rounded-lg border border-white/10 text-slate-500 hover:text-red-300 hover:border-red-500/20 text-[9px] font-bold transition-colors"
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer hint */}
                  {envVars.length > 0 && !envBulkMode && (
                    <p className="text-[9px] text-slate-600 max-w-2xl">
                      Changes are saved automatically per variable. Click <strong className="text-slate-300">Redeploy</strong> to apply them to your running container.
                    </p>
                  )}
                </div>
              )}

              {/* Custom domains tab */}
              {detailsTab === 'domains' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Domains</h4>
                    <p className="text-[10px] text-slate-500">Manage domains for your deployment. SSL is automatically provisioned.</p>
                  </div>

                  {/* ── Add domain form ── */}
                  <form onSubmit={handleAddDomain} className="space-y-2 max-w-lg">
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          required
                          placeholder="yourdomain.com or www.yourdomain.com"
                          value={customDomain}
                          onChange={(e) => { setCustomDomain(e.target.value); setDomainError(''); }}
                          className="w-full h-10 px-3 pr-10 rounded-xl glass-input text-xs text-white placeholder-slate-600 border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors"
                        />
                        {customDomain && getDomainType(customDomain) && (
                          <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-bold px-1.5 py-0.5 rounded ${
                            getDomainType(customDomain) === 'apex' ? 'bg-amber-500/20 text-amber-400' :
                            getDomainType(customDomain) === 'www' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-purple-600/20 text-violet-400'
                          }`}>
                            {getDomainType(customDomain) === 'apex' ? 'ROOT' : getDomainType(customDomain) === 'www' ? 'WWW' : 'SUB'}
                          </span>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={domainAdding || !customDomain.trim()}
                        className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap"
                      >
                        {domainAdding ? (
                          <><span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />Adding...</>
                        ) : 'Add Domain'}
                      </button>
                    </div>
                    {domainError && (
                      <p className="text-[10px] text-red-400 flex items-center gap-1">⚠ {domainError}</p>
                    )}
                  </form>

                  {/* ── Dynamic DNS Instructions ── */}
                  {(() => {
                    const dtype = getDomainType(customDomain);
                    const cleanHost = customDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
                    const showApex = !customDomain || dtype === 'apex';
                    const showCname = !customDomain || dtype === 'www' || dtype === 'subdomain';
                    const nameLabel = dtype === 'www' ? 'www' : dtype === 'subdomain' ? cleanHost.split('.')[0] : '@';

                    return (
                      <div className="max-w-lg space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-zinc-400">DNS Configuration</span>
                          {customDomain && dtype && (
                            <span className="text-[8px] text-zinc-500">
                              — {dtype === 'apex' ? 'Add an A record for the root domain' : dtype === 'www' ? 'Add a CNAME for the www subdomain' : 'Add a CNAME for this subdomain'}
                            </span>
                          )}
                          <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="ml-auto text-[9px] text-violet-400 hover:underline font-bold flex items-center gap-1">
                            Cloudflare →
                          </a>
                        </div>

                        {/* A Record - shown for apex or when no input */}
                        {showApex && (
                          <div className="rounded-xl border border-amber-500/10 overflow-hidden bg-black/20">
                            <div className="px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/10 flex items-center gap-2">
                              <span className="text-[9px] font-bold text-amber-400">A Record</span>
                              <span className="text-[9px] text-zinc-500">Root / Apex domain ({cleanHost || 'yourdomain.com'})</span>
                              <span className="ml-auto text-[8px] text-zinc-600">⚠ Delete old A records first</span>
                            </div>
                            <div className="grid grid-cols-3 divide-x divide-white/5 font-mono text-[9px]">
                              {[
                                { label: 'Type', val: 'A', color: 'text-amber-400', key: 'type-a' },
                                { label: 'Name', val: '@', color: 'text-white', key: 'name-a' },
                                { label: 'IPv4 Address', val: '204.168.147.13', color: 'text-emerald-400', key: 'ip' },
                              ].map(f => (
                                <div key={f.key} className="px-3 py-2.5 flex items-start justify-between group">
                                  <div>
                                    <span className="text-zinc-600 block text-[8px] mb-0.5">{f.label}</span>
                                    <span className={`${f.color} font-bold`}>{f.val}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(f.val, f.key)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[8px] text-zinc-500 hover:text-white mt-0.5"
                                  >
                                    {copiedField === f.key ? '✓' : '⧉'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* CNAME Record - shown for www/subdomain or when no input */}
                        {showCname && (
                          <div className="rounded-xl border border-purple-600/10 overflow-hidden bg-black/20">
                            <div className="px-3 py-1.5 bg-purple-500/5 border-b border-purple-600/10 flex items-center gap-2">
                              <span className="text-[9px] font-bold text-violet-400">CNAME Record</span>
                              <span className="text-[9px] text-zinc-500">Subdomain ({dtype === 'www' ? cleanHost : dtype === 'subdomain' ? cleanHost : 'www.yourdomain.com'})</span>
                            </div>
                            <div className="grid grid-cols-3 divide-x divide-white/5 font-mono text-[9px]">
                              {[
                                { label: 'Type', val: 'CNAME', color: 'text-violet-400', key: 'type-c' },
                                { label: 'Name', val: nameLabel, color: 'text-white', key: 'name-c' },
                                { label: 'Target', val: 'cloud.khawarahemad.com', color: 'text-emerald-400', key: 'target' },
                              ].map(f => (
                                <div key={f.key} className="px-3 py-2.5 flex items-start justify-between group">
                                  <div>
                                    <span className="text-zinc-600 block text-[8px] mb-0.5">{f.label}</span>
                                    <span className={`${f.color} font-bold`}>{f.val}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(f.val, f.key)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[8px] text-zinc-500 hover:text-white mt-0.5"
                                  >
                                    {copiedField === f.key ? '✓' : '⧉'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <p className="text-[8px] text-zinc-600">
                          ☁ In Cloudflare, set Proxy to <strong className="text-zinc-500">DNS only</strong> (grey cloud). SSL is handled automatically by KH Cloud.
                        </p>
                      </div>
                    );
                  })()}

                  {/* ── Domain List ── */}
                  <div className="space-y-2 max-w-lg">
                    {projectDetails?.domains?.length === 0 && (
                      <p className="text-[10px] text-zinc-600 py-4 text-center">No domains connected yet.</p>
                    )}
                    {projectDetails?.domains?.map((dom: any) => {
                      const isSystem = dom.hostname.endsWith('.khawarahemad.com');
                      const isActive = dom.status === 'ACTIVE' || !dom.status;
                      const isPending = dom.status === 'PENDING';
                      return (
                        <div key={dom.id} className="p-3 rounded-xl border border-white/5 bg-white/[0.015] flex items-center gap-3 group hover:border-white/10 transition-colors">
                          {/* Status dot */}
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            isPending ? 'bg-amber-400 animate-pulse' : isActive ? 'bg-emerald-400' : 'bg-zinc-600'
                          }`} />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <a
                                href={`https://${dom.hostname}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-bold text-white hover:text-violet-400 transition-colors truncate"
                              >
                                {dom.hostname}
                              </a>
                              {isSystem && (
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/10 text-violet-400 font-bold flex-shrink-0">FREE</span>
                              )}
                              {dom.isCustom && (
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400 font-bold flex-shrink-0">CUSTOM</span>
                              )}
                            </div>
                            <div className="text-[9px] text-zinc-500 mt-0.5 flex items-center gap-1.5">
                              {isPending ? (
                                <><span className="text-amber-400">⟳ Provisioning SSL & routing...</span></>
                              ) : isActive ? (
                                <><span className="text-emerald-400">✓ HTTPS Active</span> · <span>{dom.isCustom ? 'Custom domain' : 'Auto-provisioned'}</span></>
                              ) : (
                                <span className="text-red-400">⚠ Verification failed</span>
                              )}
                            </div>
                          </div>

                          {!isSystem && (
                            <button
                              onClick={() => handleRemoveDomain(dom.id)}
                              disabled={removingDomainId === dom.id}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-zinc-500 hover:text-red-400 font-semibold disabled:opacity-50 flex-shrink-0 px-2 py-1 rounded hover:bg-red-500/5"
                            >
                              {removingDomainId === dom.id ? '...' : 'Remove'}
                            </button>
                          )}
                        </div>
                      );
                    })}
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
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Root Directory</label>
                        <input
                          type="text"
                          placeholder="e.g. frontend (leave blank for root)"
                          value={editRootDir}
                          onChange={(e) => setEditRootDir(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg glass-input text-xs font-semibold text-white font-mono"
                        />
                        <span className="text-[9px] text-zinc-500 block mt-1 leading-normal">
                          The subdirectory containing your app code.
                        </span>
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
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Install Command</label>
                        <input
                          type="text"
                          required
                          value={editInstallCmd}
                          onChange={(e) => setEditInstallCmd(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg glass-input text-xs font-semibold text-white font-mono"
                        />
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
                        className="h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-all active:scale-95 duration-100 flex items-center gap-1.5 shadow-md shadow-indigo-500/10 disabled:bg-zinc-700 disabled:text-zinc-400"
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

                  {/* GitOps Guide Card */}
                  <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 max-w-3xl">
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Github size={16} className="text-zinc-400" />
                      GitOps Auto-Deployment
                    </h4>
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                      Automatically trigger a clean rebuild and redeployment of your container whenever you push code changes to your repository.
                    </p>
                    <div className="space-y-2.5">
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Webhook Configuration:</div>
                      <ol className="list-decimal list-inside text-[9px] text-zinc-400 space-y-1.5 leading-relaxed bg-black/20 p-4 rounded-xl border border-white/5 font-medium">
                        <li>Go to your repository settings on GitHub.</li>
                        <li>Select <strong>Webhooks</strong> in the sidebar, and click <strong>Add webhook</strong>.</li>
                        <li>Set <strong>Payload URL</strong> to: <code className="text-violet-400 select-all font-mono font-bold bg-white/5 px-1.5 py-0.5 rounded">https://api.khawarahemad.com/api/github/webhook</code></li>
                        <li>Set <strong>Content type</strong> to: <code className="text-zinc-300 font-mono">application/json</code></li>
                        <li>Select <strong>Just the push event</strong> and click <strong>Add webhook</strong>.</li>
                      </ol>
                    </div>
                  </div>

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

              {/* Console / Runtime Logs tab */}
              {detailsTab === 'console' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-400">Runtime Container Console</h4>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Live stdout/stderr stream from the running container.</p>
                    </div>
                    <button
                      onClick={fetchRuntimeLogs}
                      className="h-8 px-2.5 rounded-lg border border-white/5 hover:bg-white/5 text-[10px] font-semibold flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
                    >
                      <RefreshCw size={10} />
                      Refresh
                    </button>
                  </div>

                  <div className="font-mono text-[10px] text-zinc-300 bg-black/40 border border-white/5 p-4 rounded-xl max-h-[400px] overflow-y-auto whitespace-pre-wrap select-text leading-relaxed">
                    {runtimeLogs}
                  </div>
                </div>
              )}

              {/* Terminal tab */}
              {detailsTab === 'terminal' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-400">Interactive Shell Container Terminal</h4>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Execute shell commands inside the container environment.</p>
                    </div>
                  </div>

                  <div className="font-mono text-[10px] bg-black/50 border border-white/5 rounded-xl overflow-hidden flex flex-col h-[350px]">
                    <div className="flex-1 p-4 overflow-y-auto space-y-1.5 select-text">
                      {terminalHistory.map((line, idx) => (
                        <div key={idx} className={line.startsWith('$') ? 'text-violet-400 font-bold' : line.startsWith('Error') ? 'text-red-400' : 'text-zinc-300 whitespace-pre-wrap'}>
                          {line}
                        </div>
                      ))}
                      {terminalRunning && (
                        <div className="text-zinc-500 flex items-center gap-1.5 animate-pulse">
                          <Loader2 size={10} className="animate-spin" />
                          Executing command...
                        </div>
                      )}
                    </div>
                    
                    <form onSubmit={handleTerminalSubmit} className="flex border-t border-white/5 bg-black/20 p-2.5">
                      <span className="text-violet-400 font-bold self-center mr-2 shrink-0 select-none">$</span>
                      <input
                        type="text"
                        value={terminalInput}
                        onChange={(e) => setTerminalInput(e.target.value)}
                        placeholder="Type a shell command (e.g. ls -la) and press Enter..."
                        className="flex-1 bg-transparent border-none outline-none text-white font-mono text-[10px]"
                        disabled={terminalRunning}
                      />
                    </form>
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
          <div style={{ backgroundColor: "#111318", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px" }} className="p-6 rounded-2xl max-w-lg w-full border border-white/10 shadow-2xl">
            <h3 className="text-base font-bold mb-1">Deploy New Web Application</h3>
            
            {/* Step indicators */}
            <div className="flex gap-2 my-4">
              {[1, 2, 3].map(step => (
                <div key={step} className={`h-1.5 rounded-full flex-1 transition-all ${
                  wizardStep >= step ? 'bg-purple-600' : 'bg-white/10'
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
                          className="h-9 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-md active:scale-95 duration-100 flex items-center gap-2"
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
                            className="text-[10px] text-violet-400 hover:underline flex items-center gap-1 font-semibold"
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
                            <Loader2 className="w-6 h-6 animate-spin text-violet-500 mb-2" />
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
                                      ? 'border-purple-600 bg-purple-500/5 text-violet-400 font-bold'
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
                      disabled={!newProjectName.trim() || !selectedRepo || detectingProject}
                      onClick={handleConfigureSettings}
                      className="h-9 px-4 rounded-lg bg-white hover:bg-zinc-200 text-black font-semibold text-xs disabled:bg-zinc-700 disabled:text-zinc-400 transition-colors flex items-center gap-1.5"
                    >
                      {detectingProject ? (
                        <>
                          <Loader2 size={12} className="animate-spin text-black" />
                          Analyzing Repository...
                        </>
                      ) : 'Configure Settings'}
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
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Root Directory</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. frontend (leave blank to deploy from repository root)"
                        value={rootDir}
                        onChange={(e) => setRootDir(e.target.value)}
                        className="flex-1 h-10 px-3 rounded-xl glass-input text-xs font-semibold text-white"
                      />
                      <button
                        type="button"
                        onClick={reDetectProjectConfig}
                        disabled={detectingProject}
                        className="h-10 px-3 rounded-xl border border-white/10 hover:bg-white/5 text-[10px] font-bold text-zinc-400 hover:text-white transition-colors disabled:opacity-50 shrink-0 flex items-center gap-1"
                      >
                        {detectingProject ? (
                          <>
                            <Loader2 size={10} className="animate-spin text-violet-500" />
                            Scanning...
                          </>
                        ) : 'Detect Config'}
                      </button>
                    </div>
                    <span className="text-[9px] text-zinc-500 block mt-1 leading-normal">
                      The folder within your repository where your code lives (like frontend/ or client/).
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Install Command</label>
                    <input
                      type="text"
                      required
                      value={installCommand}
                      onChange={(e) => setInstallCommand(e.target.value)}
                      placeholder="e.g. npm install"
                      className="w-full h-10 px-3 rounded-xl glass-input text-xs font-semibold text-white"
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
                      type="button"
                      onClick={() => setWizardStep(3)}
                      className="h-9 px-5 rounded-lg bg-white hover:bg-zinc-200 text-black font-semibold text-xs active:scale-95 transition-colors"
                    >
                      Configure Env Variables
                    </button>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Paste .env file contents (Optional)</label>
                    <textarea
                      value={rawEnvText}
                      onChange={(e) => setRawEnvText(e.target.value)}
                      placeholder="DATABASE_URL=postgresql://user:pass@host/db&#10;PORT=3000&#10;API_KEY=mysecretkey"
                      className="w-full h-32 p-3 rounded-xl glass-input text-xs font-mono text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-white/20"
                    />
                  </div>

                  {parsedEnvVars.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Parsed Variables ({parsedEnvVars.length})</label>
                      <div className="max-h-28 overflow-y-auto border border-white/5 rounded-xl p-3 bg-white/[0.01] space-y-1.5 pr-1">
                        {parsedEnvVars.map((ev, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[10px] bg-white/5 px-2.5 py-1 rounded-lg">
                            <span className="font-mono text-violet-400 font-bold">{ev.key}</span>
                            <span className="font-mono text-zinc-400 truncate max-w-[200px]">{ev.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-4">
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="h-9 px-5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs active:scale-95 shadow-lg shadow-indigo-500/10"
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
          <div style={{ backgroundColor: "#111318", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px" }} className="rounded-2xl max-w-3xl w-full h-[500px] border border-white/10 shadow-2xl flex flex-col overflow-hidden">
            <div className="h-14 border-b border-white/5 px-6 flex items-center justify-between shrink-0 bg-black/40">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-violet-400" />
                <h3 className="text-xs font-bold font-mono">Deployment Console Logs</h3>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                  logStatus === 'READY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-purple-500/10 text-violet-400'
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

      {/* Delete Project Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div style={{ backgroundColor: "#111318", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px" }} className="p-6 rounded-2xl max-w-md w-full border border-white/10 shadow-2xl space-y-4 text-left">
            <h3 className="text-sm font-bold text-red-400">Delete Project</h3>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              This action **cannot be undone**. This will permanently delete the project **{projectDetails?.name}**, all associated deployments, database logs, and stop the running Docker container on the host VPS.
            </p>
            <div className="space-y-1.5 bg-red-500/5 border border-red-500/10 p-3.5 rounded-xl">
              <span className="text-[10px] text-zinc-400 block leading-normal">
                To confirm deletion, please type the project name <code className="text-white font-bold select-all bg-white/5 px-1.5 py-0.5 rounded font-mono">{projectDetails?.name}</code> in the box below:
              </span>
            </div>
            <input
              type="text"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder={projectDetails?.name}
              className="w-full h-10 px-3 rounded-xl glass-input text-xs font-semibold text-white focus:outline-none"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteConfirmInput('');
                }}
                className="h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmInput !== projectDetails?.name}
                onClick={confirmDeleteProject}
                className="h-9 px-4 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-zinc-700 disabled:text-zinc-400 text-white font-bold text-xs transition-all active:scale-95 duration-100 shadow-md shadow-red-500/10"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
