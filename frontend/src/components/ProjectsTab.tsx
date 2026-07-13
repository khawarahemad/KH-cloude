'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { Layers, Plus, Settings, RefreshCw, Terminal, Eye, EyeOff, Globe, Server, Play, ArrowLeft, Loader2, Database, Lock, Unlock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDialog } from './CustomDialogProvider';

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
  const { activeTeam, user, projectsCache: projects, setProjectsCache: setProjects } = useAppStore();
  const { alert } = useDialog();
  const [loading, setLoading] = useState(projects === null);
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

  // GitHub App integration states
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubAccount, setGithubAccount] = useState('');
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
  const [buildSettingsOpen, setBuildSettingsOpen] = useState(false);

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
    if (!activeTeam) return;
    setGithubLoading(true);
    try {
      const data = await apiRequest(`/github-app/repos?teamId=${activeTeam.id}`);
      setGithubConnected(data.connected === true);
      setGithubAccount(data.accountLogin || '');
      setGithubRepos(data.repos || []);
    } catch (err) {
      setGithubConnected(false);
      setGithubRepos([]);
    } finally {
      setGithubLoading(false);
    }
  };

  const openGithubAppInstall = async () => {
    if (!activeTeam) return;
    try {
      // Save teamId before opening popup — GitHub doesn't send state back via Setup URL
      localStorage.setItem('github_app_pending_teamId', activeTeam.id);

      // Use manage-url: returns manage link for existing installs, install link for new ones
      const data = await apiRequest(`/github-app/manage-url?teamId=${activeTeam.id}`);
      const targetUrl = data.url;

      const popup = window.open(
        targetUrl,
        'github-app-install',
        'width=1000,height=700,scrollbars=yes,resizable=yes'
      );

      // Listen for postMessage from popup (sent by page.tsx after GitHub redirects back)
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === 'GITHUB_APP_INSTALLED') {
          window.removeEventListener('message', onMessage);
          clearInterval(poll);
          fetchGithubRepos();
        }
      };
      window.addEventListener('message', onMessage);

      // Fallback: also poll for popup close (covers cases where postMessage doesn't fire)
      const poll = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(poll);
          window.removeEventListener('message', onMessage);
          fetchGithubRepos();
        }
      }, 800);
    } catch (err) {
      console.error('Failed to get GitHub App URL:', err);
    }
  };


  useEffect(() => {
    if (wizardOpen && activeTeam) {
      fetchGithubRepos();
    }
  }, [wizardOpen, activeTeam]);

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
    if (!projects) setLoading(true);
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
          userId: user?.id,
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
      alert({ title: 'Error', message: 'Failed to delete project.', type: 'error' });
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
      alert({ title: 'Settings Saved', message: 'Project settings saved successfully! Click Redeploy to rebuild with the new commands.', type: 'success' });
      fetchProjects();
    } catch (err) {
      console.error(err);
      alert({ title: 'Error', message: 'Failed to update project settings.', type: 'error' });
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
          (projects || []).length === 0 ? (
            <div className="rw-empty">
              <div className="rw-empty-icon"><Layers size={20} style={{ color: '#6b7280' }} /></div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f3f6' }}>No projects yet</h3>
              <p style={{ fontSize: '13px', color: '#6b7280', maxWidth: '320px' }}>Import code from GitHub, configure the runtime, and launch a production-ready app in one flow.</p>
              <button onClick={() => setWizardOpen(true)} className="rw-btn rw-btn-primary rw-btn-lg" style={{ marginTop: '4px' }}><Plus size={14} /> Deploy first app</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
              {(projects || []).map((proj) => {
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
            <div className="space-y-0">
            {/* Project Header Bar */}
            <div style={{ backgroundColor: '#111318', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Server size={16} style={{ color: '#a78bfa' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#f1f3f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectDetails?.name}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                      backgroundColor: projectDetails?.status === 'READY' ? 'rgba(34,197,94,0.1)' : 'rgba(124,58,237,0.1)',
                      color: projectDetails?.status === 'READY' ? '#22c55e' : '#a78bfa',
                      border: projectDetails?.status === 'READY' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(124,58,237,0.2)'
                    }}>{projectDetails?.status}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', fontSize: '11px', color: '#6b7280' }}>
                    <Globe size={11} />
                    <a href={`https://${projectDetails?.domains?.[0]?.hostname}`} target="_blank" rel="noopener noreferrer" style={{ color: '#7c3aed', textDecoration: 'none' }} className="hover:underline">
                      {projectDetails?.domains?.[0]?.hostname}
                    </a>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button onClick={handleRestart} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 12px', borderRadius: '7px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9ba3af', fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s' }} className="hover:bg-white/5 hover:text-white">
                  <RefreshCw size={12} /> Restart
                </button>
                <button onClick={handleDeploy} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 14px', borderRadius: '7px', backgroundColor: '#7c3aed', border: '1px solid rgba(124,58,237,0.5)', color: '#fff', fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s' }}>
                  <Play size={12} /> Redeploy
                </button>
              </div>
            </div>

            {/* Sub-tab Navigation - no glitch, fixed height */}
            <div style={{ backgroundColor: '#0e1015', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '0', overflowX: 'auto' }}>
              {(['deployments', 'env', 'domains', 'metrics', 'console', 'terminal', 'settings'] as const).map(tab => {
                const isActive = detailsTab === tab;
                const labels: Record<string, string> = { deployments: 'Deployments', env: 'Variables', domains: 'Domains', metrics: 'Metrics', console: 'Logs', terminal: 'Terminal', settings: 'Settings' };
                return (
                  <button
                    key={tab}
                    onClick={() => setDetailsTab(tab)}
                    style={{
                      position: 'relative', padding: '0 16px', height: '40px', fontSize: '12px', fontWeight: isActive ? 600 : 400,
                      color: isActive ? '#c4b5fd' : '#6b7280', backgroundColor: 'transparent', border: 'none',
                      borderBottom: isActive ? '2px solid #7c3aed' : '2px solid transparent',
                      cursor: 'pointer', transition: 'color 0.12s', whiteSpace: 'nowrap', outline: 'none',
                    }}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            {/* TAB CONTENT AREA */}
            <div style={{ padding: '24px', minHeight: '400px' }}>

              {/* ── Deployments ── */}
              {detailsTab === 'deployments' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '2px' }}>Deployment History</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Each deployment is an immutable snapshot of your container.</div>
                    </div>
                    {activeDeploymentId && (
                      <button onClick={() => setLogsOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 12px', borderRadius: '7px', backgroundColor: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)', color: '#c4b5fd', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}>
                        <Terminal size={11} /> Live Logs
                      </button>
                    )}
                  </div>
                  <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', overflow: 'hidden' }}>
                    {projectDetails?.deployments?.length === 0 && (
                      <div style={{ padding: '48px 24px', textAlign: 'center', color: '#4b5563', fontSize: '13px' }}>No deployments yet. Click Redeploy to trigger the first build.</div>
                    )}
                    {projectDetails?.deployments?.map((dep: any, i: number) => (
                      <div key={dep.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < (projectDetails.deployments.length - 1) ? '1px solid rgba(255,255,255,0.06)' : 'none', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor: dep.status === 'READY' ? '#22c55e' : dep.status === 'FAILED' ? '#ef4444' : '#a78bfa' }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: '#f1f3f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dep.commitMessage || 'Manual Deployment'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>
                              <span>Branch: {dep.branch}</span>
                              <span>·</span>
                              <span>{new Date(dep.createdAt).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
                            backgroundColor: dep.status === 'READY' ? 'rgba(34,197,94,0.1)' : dep.status === 'FAILED' ? 'rgba(239,68,68,0.1)' : 'rgba(124,58,237,0.1)',
                            color: dep.status === 'READY' ? '#22c55e' : dep.status === 'FAILED' ? '#ef4444' : '#a78bfa',
                            border: dep.status === 'READY' ? '1px solid rgba(34,197,94,0.2)' : dep.status === 'FAILED' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(124,58,237,0.2)'
                          }}>{dep.status}</span>
                          <button onClick={async () => { const logs = await apiRequest(`/deployments/${dep.id}/logs`); setBuildLogs(logs.logs); setLogStatus(dep.status); setLogsOpen(true); }}
                            style={{ height: '26px', padding: '0 10px', borderRadius: '6px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#9ba3af', fontSize: '11px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }} className="hover:bg-white/5 hover:text-white">
                            <Terminal size={10} /> Logs
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Env Variables ── */}
              {detailsTab === 'env' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '3px' }}>Environment Variables</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Injected into your app containers at runtime. Redeploy is required to apply updates.</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => { setEnvBulkMode(!envBulkMode); setEnvBulkText(''); }}
                        style={{ height: '28px', padding: '0 12px', borderRadius: '6px', border: `1px solid ${envBulkMode ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.08)'}`, backgroundColor: envBulkMode ? 'rgba(124,58,237,0.1)' : 'transparent', color: envBulkMode ? '#c4b5fd' : '#9ba3af', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s' }}>
                        {envBulkMode ? '✕ Cancel' : '⊞ Bulk Import'}
                      </button>
                      {envVars.length > 0 && (
                        <button onClick={() => saveEnvVars(envVars)} disabled={envSaving}
                          style={{ height: '28px', padding: '0 14px', borderRadius: '6px', backgroundColor: '#22c55e12', border: '1px solid #22c55e30', color: '#22c55e', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s', opacity: envSaving ? 0.5 : 1 }}>
                          {envSaving ? 'Saving...' : envSaved ? '✓ Saved' : '↑ Save Changes'}
                        </button>
                      )}
                    </div>
                  </div>

                  {envBulkMode ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>Paste raw env contents directly (e.g. `KEY=VALUE` line-by-line).</div>
                      <textarea value={envBulkText} onChange={e => setEnvBulkText(e.target.value)} rows={8} placeholder={`DATABASE_URL=postgres://...\nAPI_SECRET=supersecretkey\nPORT=8080`}
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db', fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.6, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={handleBulkPaste} disabled={!envBulkText.trim()}
                          style={{ height: '32px', padding: '0 16px', borderRadius: '7px', backgroundColor: '#7c3aed', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: !envBulkText.trim() ? 0.4 : 1 }}>Import</button>
                        <button onClick={() => { setEnvBulkMode(false); setEnvBulkText(''); }}
                          style={{ height: '32px', padding: '0 16px', borderRadius: '7px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9ba3af', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Add new var row */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', backgroundColor: '#111318', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: '10px', color: '#4b5563', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>Variable Key</label>
                          <input type="text" placeholder="VARIABLE_NAME" value={newEnvKey} onChange={e => setNewEnvKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ flex: 2 }}>
                          <label style={{ fontSize: '10px', color: '#4b5563', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>Variable Value</label>
                          <input type={newEnvSecret ? 'password' : 'text'} placeholder="value" value={newEnvVal} onChange={e => setNewEnvVal(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontFamily: 'monospace', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <button type="button" onClick={() => setNewEnvSecret(!newEnvSecret)} title={newEnvSecret ? 'Secret variable (encrypted)' : 'Plaintext variable'}
                          style={{ width: '34px', height: '34px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#0e1015', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {newEnvSecret ? <Lock size={13} style={{ color: '#c4b5fd' }} /> : <Unlock size={13} style={{ color: '#6b7280' }} />}
                        </button>
                        <button onClick={handleAddEnv} disabled={!newEnvKey.trim() || !newEnvVal.trim()}
                          style={{ height: '34px', padding: '0 16px', borderRadius: '6px', backgroundColor: '#7c3aed', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (!newEnvKey.trim() || !newEnvVal.trim()) ? 0.4 : 1 }}>
                          Add
                        </button>
                      </div>

                      {/* Variable list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {envVars.length === 0 ? (
                          <div style={{ padding: '32px', textAlign: 'center', color: '#4b5563', fontSize: '12px', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '8px' }}>
                            No environment variables configured yet.
                          </div>
                        ) : (
                          envVars.map(env => (
                            <div key={env.key} style={{ display: 'flex', alignItems: 'center', minHeight: '44px', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', gap: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <span style={{ fontSize: '8px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: env.isSecret ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.05)', color: env.isSecret ? '#f59e0b' : '#8a929e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  {env.isSecret ? 'secret' : 'plain'}
                                </span>
                              </div>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '12px', color: '#f1f3f6', width: '160px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{env.key}</span>
                              
                              {envEditingKey === env.key ? (
                                <div style={{ flex: 1, display: 'flex', gap: '6px' }}>
                                  <input autoFocus type="text" value={envEditVal} onChange={e => setEnvEditVal(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleUpdateEnvValue(env.key, envEditVal); if (e.key === 'Escape') setEnvEditingKey(null); }}
                                    style={{ flex: 1, height: '28px', padding: '0 8px', borderRadius: '5px', backgroundColor: '#0e1015', border: '1px solid rgba(124,58,237,0.4)', color: '#fff', fontFamily: 'monospace', fontSize: '12px', outline: 'none' }} />
                                  <button onClick={() => handleUpdateEnvValue(env.key, envEditVal)} style={{ height: '28px', padding: '0 10px', borderRadius: '5px', backgroundColor: '#22c55e15', border: '1px solid #22c55e30', color: '#22c55e', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                                  <button onClick={() => setEnvEditingKey(null)} style={{ height: '28px', width: '28px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', cursor: 'pointer', backgroundColor: 'transparent' }}>✕</button>
                                </div>
                              ) : (
                                <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px', color: '#8a929e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {envRevealedKeys.has(env.key) ? env.value : (env.isSecret ? '••••••••••••••••••••••••' : env.value)}
                                </span>
                              )}
                              
                              {envEditingKey !== env.key && (
                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                  {env.isSecret && (
                                    <button onClick={() => toggleReveal(env.key)} style={{ height: '26px', width: '26px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.08)', color: '#8a929e', cursor: 'pointer', backgroundColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }} className="hover:text-white hover:bg-white/5">
                                      {envRevealedKeys.has(env.key) ? <EyeOff size={12} /> : <Eye size={12} />}
                                    </button>
                                  )}
                                  <button onClick={() => { setEnvEditingKey(env.key); setEnvEditVal(env.value); }} style={{ height: '26px', padding: '0 8px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.08)', color: '#9ba3af', fontSize: '11px', fontWeight: 600, cursor: 'pointer', backgroundColor: 'transparent' }} className="hover:text-white hover:bg-white/5">Edit</button>
                                  <button onClick={() => handleRemoveEnv(env.key)} style={{ height: '26px', padding: '0 8px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', fontSize: '11px', fontWeight: 600, cursor: 'pointer', backgroundColor: 'transparent' }} className="hover:text-red-400 hover:border-red-500/30">Remove</button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Domains ── */}
              {detailsTab === 'domains' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '3px' }}>Custom Domains</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Point your own domain name to this project container. SSL certificate is automatically provisioned.</div>
                  </div>

                  <form onSubmit={handleAddDomain} style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input type="text" required placeholder="yourdomain.com or subdomain.yourdomain.com" value={customDomain}
                        onChange={e => { setCustomDomain(e.target.value); setDomainError(''); }}
                        style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: '7px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                      {customDomain && getDomainType(customDomain) && (
                        <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '8px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                          backgroundColor: getDomainType(customDomain) === 'apex' ? 'rgba(245,158,11,0.15)' : 'rgba(124,58,237,0.15)',
                          color: getDomainType(customDomain) === 'apex' ? '#f59e0b' : '#c4b5fd',
                          textTransform: 'uppercase', letterSpacing: '0.04em'
                        }}>{getDomainType(customDomain) === 'apex' ? 'root' : getDomainType(customDomain) === 'www' ? 'www' : 'sub'}</span>
                      )}
                    </div>
                    <button type="submit" disabled={domainAdding || !customDomain.trim()}
                      style={{ height: '36px', padding: '0 16px', borderRadius: '7px', backgroundColor: '#7c3aed', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (domainAdding || !customDomain.trim()) ? 0.5 : 1 }}>
                      {domainAdding ? 'Adding...' : 'Add Domain'}
                    </button>
                  </form>
                  {domainError && <div style={{ fontSize: '12px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>⚠ {domainError}</div>}

                  {/* DNS Instructions */}
                  {(() => {
                    const dtype = getDomainType(customDomain);
                    const cleanHost = customDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
                    const showApex = !customDomain || dtype === 'apex';
                    const showCname = !customDomain || dtype === 'www' || dtype === 'subdomain';
                    const nameLabel = dtype === 'www' ? 'www' : dtype === 'subdomain' ? cleanHost.split('.')[0] : '@';
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em' }}>DNS Configuration Instructions</div>
                        
                        {showApex && (
                          <div style={{ borderRadius: '8px', border: '1px solid rgba(245,158,11,0.15)', backgroundColor: '#111318', overflow: 'hidden' }}>
                            <div style={{ padding: '8px 12px', backgroundColor: 'rgba(245,158,11,0.04)', borderBottom: '1px solid rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b', textTransform: 'uppercase' }}>A Record</span>
                              <span style={{ fontSize: '11px', color: '#8a929e' }}>Apex / root domain mapping</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', fontFamily: 'monospace', fontSize: '11px' }}>
                              {[{ l: 'Type', v: 'A', c: '#f59e0b' }, { l: 'Name / Host', v: '@', c: '#f1f3f6' }, { l: 'Value / IPv4', v: '204.168.147.13', c: '#22c55e' }].map((f, i) => (
                                <div key={f.l} style={{ padding: '10px 12px', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                  <div style={{ fontSize: '9px', color: '#4b5563', marginBottom: '4px', textTransform: 'uppercase' }}>{f.l}</div>
                                  <span style={{ color: f.c, fontWeight: 700 }}>{f.v}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {showCname && (
                          <div style={{ borderRadius: '8px', border: '1px solid rgba(124,58,237,0.15)', backgroundColor: '#111318', overflow: 'hidden' }}>
                            <div style={{ padding: '8px 12px', backgroundColor: 'rgba(124,58,237,0.04)', borderBottom: '1px solid rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(124,58,237,0.15)', color: '#c4b5fd', textTransform: 'uppercase' }}>CNAME Record</span>
                              <span style={{ fontSize: '11px', color: '#8a929e' }}>Subdomain mapping</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', fontFamily: 'monospace', fontSize: '11px' }}>
                              {[{ l: 'Type', v: 'CNAME', c: '#c4b5fd' }, { l: 'Name / Host', v: nameLabel, c: '#f1f3f6' }, { l: 'Value / Target', v: 'cloud.khawarahemad.com', c: '#22c55e' }].map((f, i) => (
                                <div key={f.l} style={{ padding: '10px 12px', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                  <div style={{ fontSize: '9px', color: '#4b5563', marginBottom: '4px', textTransform: 'uppercase' }}>{f.l}</div>
                                  <span style={{ color: f.c, fontWeight: 700 }}>{f.v}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>☁ In Cloudflare, set Proxy status to <strong style={{ color: '#8a929e' }}>DNS only</strong> (gray cloud) to allow Let's Encrypt to verify.</div>
                      </div>
                    );
                  })()}

                  {/* Domain list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {projectDetails?.domains?.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#4b5563', fontSize: '12px', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '8px' }}>
                        No domains connected yet.
                      </div>
                    ) : (
                      projectDetails?.domains?.map((dom: any) => {
                        const isSystem = dom.hostname.endsWith('.khawarahemad.com');
                        const isActive = dom.status === 'ACTIVE' || !dom.status;
                        const isPending = dom.status === 'PENDING';
                        return (
                          <div key={dom.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor: isPending ? '#f59e0b' : isActive ? '#22c55e' : '#6b7280' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <a href={`https://${dom.hostname}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6', textDecoration: 'none', transition: 'all 0.12s' }} className="hover:text-violet-400">{dom.hostname}</a>
                                {isSystem && <span style={{ fontSize: '8px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(124,58,237,0.1)', color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.04em' }}>free subdomain</span>}
                                {dom.isCustom && <span style={{ fontSize: '8px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', color: '#8a929e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>custom domain</span>}
                              </div>
                              <div style={{ fontSize: '11px', color: isPending ? '#f59e0b' : isActive ? '#22c55e' : '#ef4444', marginTop: '3px' }}>
                                {isPending ? '⟳ Provisioning SSL certificate & routing...' : isActive ? '✓ HTTPS Active' : '⚠ Verification failed'}
                              </div>
                            </div>
                            {!isSystem && (
                              <button onClick={() => handleRemoveDomain(dom.id)} disabled={removingDomainId === dom.id}
                                style={{ height: '26px', padding: '0 10px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'transparent', color: '#8a929e', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s', opacity: removingDomainId === dom.id ? 0.5 : 1 }}
                                className="hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10"
                              >
                                {removingDomainId === dom.id ? '...' : 'Remove'}
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ── Metrics ── */}
              {detailsTab === 'metrics' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                  <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '12px' }}>CPU Usage (%)</div>
                    <div style={{ height: '180px', fontSize: '10px' }}>
                      {metrics?.cpu && (
                        <RechartsContainer width="100%" height="100%">
                          <AreaChart data={metrics.cpu}>
                            <defs><linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#818cf8" stopOpacity={0.2}/><stop offset="95%" stopColor="#818cf8" stopOpacity={0}/></linearGradient></defs>
                            <XAxis dataKey="time" stroke="#374151" tick={{ fill: '#4b5563', fontSize: 9 }} />
                            <YAxis stroke="#374151" tick={{ fill: '#4b5563', fontSize: 9 }} />
                            <Tooltip contentStyle={{ background: '#0a0a0c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '11px' }} />
                            <Area type="monotone" dataKey="value" stroke="#818cf8" fillOpacity={1} fill="url(#colorCpu)" strokeWidth={1.5} />
                          </AreaChart>
                        </RechartsContainer>
                      )}
                      {!metrics?.cpu && <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563', fontSize: '12px' }}>No metrics data available</div>}
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '12px' }}>Memory Usage (MB)</div>
                    <div style={{ height: '180px', fontSize: '10px' }}>
                      {metrics?.ram && (
                        <RechartsContainer width="100%" height="100%">
                          <AreaChart data={metrics.ram}>
                            <defs><linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#c084fc" stopOpacity={0.2}/><stop offset="95%" stopColor="#c084fc" stopOpacity={0}/></linearGradient></defs>
                            <XAxis dataKey="time" stroke="#374151" tick={{ fill: '#4b5563', fontSize: 9 }} />
                            <YAxis stroke="#374151" tick={{ fill: '#4b5563', fontSize: 9 }} />
                            <Tooltip contentStyle={{ background: '#0a0a0c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '11px' }} />
                            <Area type="monotone" dataKey="value" stroke="#c084fc" fillOpacity={1} fill="url(#colorRam)" strokeWidth={1.5} />
                          </AreaChart>
                        </RechartsContainer>
                      )}
                      {!metrics?.ram && <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563', fontSize: '12px' }}>No metrics data available</div>}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Runtime Logs ── */}
              {detailsTab === 'console' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '2px' }}>Runtime Console</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Live stdout/stderr stream from the running container.</div>
                    </div>
                    <button onClick={fetchRuntimeLogs} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 12px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'transparent', color: '#9ba3af', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }} className="hover:bg-white/5 hover:text-white">
                      <RefreshCw size={11} /> Refresh
                    </button>
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: '12px', lineHeight: 1.7, color: '#9ba3af', backgroundColor: '#08090c', border: '1px solid rgba(255,255,255,0.06)', padding: '16px', borderRadius: '10px', maxHeight: '420px', overflowY: 'auto', whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                    {runtimeLogs}
                  </div>
                </div>
              )}

              {/* ── Interactive Terminal ── */}
              {detailsTab === 'terminal' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '2px' }}>Interactive Shell</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Execute shell commands inside the live container environment.</div>
                  </div>
                  <div style={{ backgroundColor: '#08090c', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '380px' }}>
                    {/* Terminal header bar */}
                    <div style={{ height: '32px', backgroundColor: '#0e1015', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '6px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                      <span style={{ fontSize: '11px', color: '#4b5563', marginLeft: '8px', fontFamily: 'monospace' }}>container shell</span>
                    </div>
                    <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: '12px', lineHeight: 1.7 }}>
                      {terminalHistory.map((line, idx) => (
                        <div key={idx} style={{ color: line.startsWith('$') ? '#c4b5fd' : line.startsWith('Error') || line.startsWith('error') ? '#f87171' : '#9ba3af', fontWeight: line.startsWith('$') ? 700 : 400, whiteSpace: 'pre-wrap' }}>
                          {line}
                        </div>
                      ))}
                      {terminalRunning && <div style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: '8px' }}><Loader2 size={11} className="animate-spin" /> Executing...</div>}
                    </div>
                    <form onSubmit={handleTerminalSubmit} style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 14px', backgroundColor: '#0a0b0e', gap: '8px' }}>
                      <span style={{ color: '#22c55e', fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, userSelect: 'none' }}>❯</span>
                      <input type="text" value={terminalInput} onChange={e => setTerminalInput(e.target.value)} placeholder="Type command and press Enter..." disabled={terminalRunning}
                        style={{ flex: 1, backgroundColor: 'transparent', border: 'none', outline: 'none', color: '#e2e8f0', fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: '12px' }} />
                    </form>
                  </div>
                </div>
              )}

              {/* ── Settings ── */}
              {detailsTab === 'settings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px' }}>
                  <form onSubmit={handleSaveSettings} style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>Project Configuration</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                      {[
                        { label: 'Project Name', value: editName, setter: setEditName, type: 'text', required: true, mono: false, placeholder: 'my-project' },
                        { label: 'Git Branch', value: editBranch, setter: setEditBranch, type: 'text', required: true, mono: true, placeholder: 'main' },
                        { label: 'Root Directory', value: editRootDir, setter: setEditRootDir, type: 'text', required: false, mono: true, placeholder: 'e.g. frontend' },
                        { label: 'Target Port', value: String(editPort), setter: (v: string) => setEditPort(parseInt(v)), type: 'number', required: true, mono: true, placeholder: '3000' },
                        { label: 'Install Command', value: editInstallCmd, setter: setEditInstallCmd, type: 'text', required: true, mono: true, placeholder: 'npm install' },
                        { label: 'Build Command', value: editBuildCmd, setter: setEditBuildCmd, type: 'text', required: true, mono: true, placeholder: 'npm run build' },
                        { label: 'Start Command', value: editStartCmd, setter: setEditStartCmd, type: 'text', required: true, mono: true, placeholder: 'npm start' },
                      ].map(field => (
                        <div key={field.label}>
                          <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4b5563', marginBottom: '6px' }}>{field.label}</div>
                          <input type={field.type} required={field.required} value={field.value} onChange={e => field.setter(e.target.value)} placeholder={field.placeholder}
                            style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: '7px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#f1f3f6', fontSize: '13px', fontFamily: field.mono ? 'monospace' : 'inherit', fontWeight: field.mono ? 500 : 400, outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: '11px', color: '#4b5563', flex: 1 }}>Repository: <strong style={{ color: '#9ba3af' }}>{projectDetails?.githubRepo}</strong></span>
                      <button type="submit" disabled={settingsSaving}
                        style={{ height: '34px', padding: '0 18px', borderRadius: '7px', backgroundColor: '#7c3aed', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: settingsSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {settingsSaving ? <><Loader2 size={12} className="animate-spin" /> Saving...</> : 'Save Settings'}
                      </button>
                    </div>
                  </form>

                  {/* GitOps */}
                  <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Github size={15} style={{ color: '#6b7280' }} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>GitOps Auto-Deployment</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6 }}>Automatically trigger a rebuild on every push to your connected repository.</div>
                    <div style={{ backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4b5563' }}>Webhook URL</div>
                      <code style={{ fontFamily: 'monospace', fontSize: '12px', color: '#c4b5fd' }}>https://api.khawarahemad.com/api/github/webhook</code>
                    </div>
                    <ol style={{ listStyleType: 'decimal', paddingLeft: '16px', fontSize: '12px', color: '#6b7280', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <li>Go to your repo Settings → Webhooks → Add webhook</li>
                      <li>Paste the Webhook URL above as Payload URL</li>
                      <li>Set Content type to <code style={{ fontFamily: 'monospace', color: '#9ba3af' }}>application/json</code></li>
                      <li>Select <strong>Just the push event</strong> and click Add webhook</li>
                    </ol>
                  </div>

                  {/* Danger Zone */}
                  <div style={{ border: '1px solid rgba(239,68,68,0.2)', backgroundColor: 'rgba(239,68,68,0.03)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ef4444' }}>Danger Zone</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6 }}>Permanently delete this project and stop its running Docker container. This action is irreversible.</div>
                    <button type="button" onClick={handleDeleteProject}
                      style={{ height: '34px', padding: '0 16px', borderRadius: '7px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '12px', fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>
                      Delete Project
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </div>

      {/* New Project Wizard Modal (Vercel/Railway Style) */}
      {wizardOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-6 transition-all duration-300">
          <div className="bg-[#0b0c10] border border-white/10 rounded-2xl max-w-xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden transform scale-100 transition-transform">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0 bg-black/20">
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">Create a New Project</h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">Deploy your web application to production in seconds.</p>
              </div>
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all text-xs"
              >
                ✕
              </button>
            </div>

            {/* Stepper indicator (Railway Style) */}
            <div className="px-6 py-4 bg-[#0d0e12] border-b border-white/5 flex items-center justify-between shrink-0 text-[10px] font-bold tracking-wider uppercase">
              <div className="flex items-center gap-6 w-full justify-around">
                <span className={`flex items-center gap-1.5 ${wizardStep === 1 ? 'text-violet-400 font-extrabold' : 'text-zinc-500'}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${wizardStep === 1 ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-zinc-800 text-zinc-600'}`}>1</span>
                  Import Repo
                </span>
                <span className="h-px bg-white/5 flex-1 max-w-[40px]" />
                <span className={`flex items-center gap-1.5 ${wizardStep === 2 ? 'text-violet-400 font-extrabold' : 'text-zinc-500'}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${wizardStep === 2 ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-zinc-800 text-zinc-600'}`}>2</span>
                  Configure
                </span>
                <span className="h-px bg-white/5 flex-1 max-w-[40px]" />
                <span className={`flex items-center gap-1.5 ${wizardStep === 3 ? 'text-violet-400 font-extrabold' : 'text-zinc-500'}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${wizardStep === 3 ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-zinc-800 text-zinc-600'}`}>3</span>
                  Environment
                </span>
              </div>
            </div>

            {/* Modal Scrollable Container */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <form onSubmit={handleCreateProject} className="space-y-6">
                
                {/* STEP 1: SELECT REPOSITORY */}
                {wizardStep === 1 && (
                  <div className="space-y-5">
                    
                    {/* Project Name input */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Project Name</label>
                      <input
                        type="text"
                        required
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="e.g. acme-landing-page"
                        className="w-full h-10 px-3 rounded-xl border border-white/5 bg-white/[0.02] hover:border-white/10 focus:border-purple-500/50 text-xs text-white placeholder-zinc-600 focus:outline-none transition-all"
                      />
                    </div>

                    {/* GitHub Connection Box */}
                    <div className="space-y-3">
                      {!githubConnected ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.01] transition-all">
                          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <Github size={24} className="text-zinc-300" />
                          </div>
                          <h4 className="text-xs font-bold text-white mb-1.5">Connect GitHub Account</h4>
                          <p className="text-[10px] text-zinc-500 max-w-sm mb-4 leading-relaxed">
                            Link the KH Cloud GitHub App to selectively authorize repositories for automatic trigger deployments.
                          </p>
                          <button
                            type="button"
                            onClick={openGithubAppInstall}
                            className="h-9 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-lg shadow-purple-500/20 active:scale-95 duration-100 flex items-center gap-2"
                          >
                            <Github size={13} />
                            Install GitHub App
                          </button>
                          {githubLoading && (
                            <p className="text-[10px] text-zinc-600 mt-3 flex items-center gap-1.5 justify-center">
                              <Loader2 size={11} className="animate-spin text-purple-500" /> Checking installation status...
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Connection details banner */}
                          <div className="flex items-center justify-between p-3 border border-white/5 rounded-xl bg-white/[0.01]">
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                <Github size={12} className="text-violet-400" />
                              </div>
                              <span className="text-[11px] font-semibold text-zinc-200">Connected account: <span className="text-violet-400 font-bold">@{githubAccount}</span></span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={openGithubAppInstall}
                                className="text-[10px] text-zinc-500 hover:text-zinc-300 font-semibold transition-colors flex items-center gap-1 border border-white/5 rounded-lg px-2.5 py-1 bg-white/[0.02]"
                              >
                                Configure
                              </button>
                              <button
                                type="button"
                                onClick={fetchGithubRepos}
                                className="text-[10px] text-violet-400 hover:text-violet-300 font-semibold transition-colors flex items-center gap-1"
                              >
                                <RefreshCw size={10} className={githubLoading ? 'animate-spin' : ''} />
                                Refresh
                              </button>
                            </div>
                          </div>

                          {/* Repo Search */}
                          <input
                            type="text"
                            placeholder="Search repositories..."
                            value={repoSearch}
                            onChange={(e) => setRepoSearch(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border border-white/5 bg-white/[0.02] hover:border-white/10 focus:border-purple-500/50 text-xs text-white placeholder-zinc-600 focus:outline-none transition-all"
                          />

                          {/* Repo list container */}
                          {githubLoading ? (
                            <div className="h-40 flex flex-col items-center justify-center text-zinc-500 text-xs">
                              <Loader2 className="w-6 h-6 animate-spin text-purple-500 mb-2" />
                              Loading your repositories...
                            </div>
                          ) : githubRepos.length === 0 ? (
                            <div className="h-40 flex flex-col items-center justify-center text-zinc-500 text-xs text-center border border-white/5 rounded-xl bg-white/[0.01] p-6">
                              <p className="font-semibold text-zinc-400">No repositories found</p>
                              <p className="text-[10px] text-zinc-600 mt-1 max-w-[250px] leading-relaxed">Ensure you have granted KH Cloud access to repositories on GitHub.</p>
                              <button type="button" onClick={openGithubAppInstall} className="mt-3 text-violet-400 hover:underline text-[10px] font-bold">
                                Configure repository permissions →
                              </button>
                            </div>
                          ) : (
                            <div className="max-h-60 overflow-y-auto grid grid-cols-1 gap-2 pr-1 custom-scrollbar">
                              {githubRepos
                                .filter(repo =>
                                  repo.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
                                  repo.fullName.toLowerCase().includes(repoSearch.toLowerCase())
                                )
                                .map(repo => (
                                  <div
                                    key={repo.fullName}
                                    className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                                      selectedRepo === repo.fullName
                                        ? 'border-purple-500/50 bg-purple-500/[0.03]'
                                        : 'border-white/5 bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.02]'
                                    }`}
                                  >
                                    <div className="min-w-0 flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                        <Github size={14} className="text-zinc-400" />
                                      </div>
                                      <div className="min-w-0">
                                        <h4 className="text-xs font-bold text-white truncate leading-snug">{repo.fullName}</h4>
                                        <p className="text-[9px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                                          <span className="font-mono text-zinc-400">{repo.defaultBranch}</span>
                                          <span>•</span>
                                          <span>{repo.private ? 'Private' : 'Public'}</span>
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={!newProjectName.trim() || detectingProject}
                                      onClick={() => {
                                        setSelectedRepo(repo.fullName);
                                        setSelectedBranch(repo.defaultBranch);
                                        if (!newProjectName.trim()) {
                                          setNewProjectName(repo.name);
                                        }
                                        handleConfigureSettings();
                                      }}
                                      className="h-8 px-4 rounded-lg bg-white text-black hover:bg-zinc-200 font-bold text-[10px] transition-all flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                                    >
                                      {detectingProject && selectedRepo === repo.fullName ? (
                                        <Loader2 size={10} className="animate-spin text-black" />
                                      ) : 'Import'}
                                    </button>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* STEP 2: CONFIGURE SETTINGS (Vercel collapsible Style) */}
                {wizardStep === 2 && (
                  <div className="space-y-5">
                    
                    {/* Selected Repository Card */}
                    <div className="p-3.5 border border-white/5 rounded-xl bg-white/[0.01] flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2.5">
                        <Github size={14} className="text-violet-400" />
                        <span className="text-[11px] font-bold text-zinc-200">{selectedRepo}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWizardStep(1)}
                        className="text-[10px] text-zinc-400 hover:text-white underline font-semibold"
                      >
                        Change Repo
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Git Branch</label>
                        <input
                          type="text"
                          required
                          value={selectedBranch}
                          onChange={(e) => setSelectedBranch(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-white/5 bg-white/[0.02] text-xs font-semibold text-white focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Target Port</label>
                        <input
                          type="number"
                          required
                          value={port}
                          onChange={(e) => setPort(parseInt(e.target.value))}
                          className="w-full h-10 px-3 rounded-xl border border-white/5 bg-white/[0.02] text-xs font-semibold text-white focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                    </div>

                    {/* Collapsible Build and Output Settings */}
                    <div className="border border-white/5 rounded-xl overflow-hidden bg-white/[0.01]">
                      <button
                        type="button"
                        onClick={() => setBuildSettingsOpen(!buildSettingsOpen)}
                        className="w-full h-11 px-4 flex items-center justify-between text-xs font-bold text-zinc-300 hover:bg-white/[0.02] transition-all"
                      >
                        <span className="flex items-center gap-2">
                          ⚡ Build and Output Settings
                        </span>
                        <span className="text-[10px] text-zinc-500 font-semibold">{buildSettingsOpen ? 'Hide Override' : 'Show Override'}</span>
                      </button>
                      
                      {buildSettingsOpen && (
                        <div className="p-4 border-t border-white/5 space-y-4 bg-black/[0.15]">
                          
                          <div className="space-y-1.5">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Root Directory</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="e.g. frontend (leave blank for root)"
                                value={rootDir}
                                onChange={(e) => setRootDir(e.target.value)}
                                className="flex-1 h-10 px-3 rounded-xl border border-white/5 bg-white/[0.02] text-xs font-semibold text-white focus:outline-none focus:border-purple-500/50"
                              />
                              <button
                                type="button"
                                onClick={reDetectProjectConfig}
                                disabled={detectingProject}
                                className="h-10 px-4 rounded-xl border border-white/10 hover:bg-white/5 text-[10px] font-bold text-zinc-400 hover:text-white transition-all disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                              >
                                {detectingProject ? (
                                  <>
                                    <Loader2 size={10} className="animate-spin text-purple-500" />
                                    Scanning...
                                  </>
                                ) : 'Detect Config'}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Install Command</label>
                            <input
                              type="text"
                              required
                              value={installCommand}
                              onChange={(e) => setInstallCommand(e.target.value)}
                              className="w-full h-10 px-3 rounded-xl border border-white/5 bg-white/[0.02] text-xs font-semibold text-white focus:outline-none focus:border-purple-500/50"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Build Command</label>
                              <input
                                type="text"
                                required
                                value={buildCommand}
                                onChange={(e) => setBuildCommand(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-white/5 bg-white/[0.02] text-xs font-semibold text-white focus:outline-none focus:border-purple-500/50"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Start Command</label>
                              <input
                                type="text"
                                required
                                value={startCommand}
                                onChange={(e) => setStartCommand(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-white/5 bg-white/[0.02] text-xs font-semibold text-white focus:outline-none focus:border-purple-500/50"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between pt-4 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => setWizardStep(1)}
                        className="h-9 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizardStep(3)}
                        className="h-9 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs active:scale-95 shadow-lg shadow-purple-500/10 transition-all"
                      >
                        Configure Environment
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: ENVIRONMENT VARIABLES */}
                {wizardStep === 3 && (
                  <div className="space-y-5">
                    
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Paste .env file contents (Optional)</label>
                        <span className="text-[9px] text-zinc-500 font-semibold">Auto-parsed into variables</span>
                      </div>
                      <textarea
                        value={rawEnvText}
                        onChange={(e) => setRawEnvText(e.target.value)}
                        placeholder="DATABASE_URL=postgresql://user:pass@host/db&#10;PORT=3000&#10;API_KEY=mysecretkey"
                        className="w-full h-36 p-3.5 rounded-xl border border-white/5 bg-white/[0.02] text-xs font-mono text-white placeholder-zinc-700 resize-none focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.03] transition-all"
                      />
                    </div>

                    {parsedEnvVars.length > 0 && (
                      <div className="space-y-2">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Parsed Key-Value Pairs ({parsedEnvVars.length})</label>
                        <div className="max-h-36 overflow-y-auto border border-white/5 rounded-xl p-3 bg-black/40 space-y-1.5 pr-1 custom-scrollbar">
                          {parsedEnvVars.map((ev, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[10px] bg-white/[0.02] border border-white/5 px-3 py-1.5 rounded-lg">
                              <span className="font-mono text-violet-400 font-bold">{ev.key}</span>
                              <span className="font-mono text-zinc-500 truncate max-w-[220px]">{ev.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between pt-4 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => setWizardStep(2)}
                        className="h-9 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        className="h-9 px-6 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs active:scale-95 shadow-xl shadow-purple-500/20 transition-all flex items-center gap-1.5"
                      >
                        🚀 Deploy Container
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>
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
