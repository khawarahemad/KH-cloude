'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import {
  HardDrive, Plus, Folder, File as FileIcon, ArrowLeft, Loader2, Upload, Trash,
  Copy, Check, Eye, EyeOff, Download, Code, BookOpen, Zap, Link, Calendar, Search, Lock, Globe
} from 'lucide-react';

export default function StorageTab() {
  const { activeTeam, setActiveTab } = useAppStore();

  const [buckets, setBuckets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<any | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [folderCreateOpen, setFolderCreateOpen] = useState(false);
  const [bucketName, setBucketName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [activeBucket, setActiveBucket] = useState<any | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewFile, setPreviewFile] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [showSecret, setShowSecret] = useState(false);
  const [sdkLanguage, setSdkLanguage] = useState<'node' | 'python' | 'go' | 'rust'>('node');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const fetchBuckets = async () => {
    if (!activeTeam) return;
    setLoading(true);
    try { setBuckets(await apiRequest(`/storage/buckets?teamId=${activeTeam.id}`)); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchFiles = async (bucketId: string, prefix = '') => {
    setFilesLoading(true);
    try { setFiles(await apiRequest(`/storage/buckets/${bucketId}/files?prefix=${prefix}`)); }
    catch (err) { console.error(err); }
    finally { setFilesLoading(false); }
  };

  const fetchBillingInfo = async () => {
    if (!activeTeam) return;
    setBillingLoading(true);
    try { setBilling(await apiRequest(`/billing?teamId=${activeTeam.id}`)); }
    catch { setBilling({ subscription: { planId: 'hobby' } }); }
    finally { setBillingLoading(false); }
  };

  useEffect(() => { fetchBuckets(); fetchBillingInfo(); }, [activeTeam]);
  useEffect(() => { if (activeBucket) fetchFiles(activeBucket.id, currentPrefix); }, [activeBucket, currentPrefix]);

  const handleCreateBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bucketName.trim() || !activeTeam) return;
    try {
      await apiRequest('/storage/buckets', { method: 'POST', body: JSON.stringify({ name: bucketName, isPublic, teamId: activeTeam.id }) });
      setBucketName(''); setIsPublic(false); setCreateOpen(false);
      fetchBuckets();
    } catch (err: any) { alert(err.message || 'Failed to create bucket.'); }
  };

  const handleDeleteBucket = async (id: string) => {
    if (!activeTeam || !confirm('Delete this bucket permanently?')) return;
    try { await apiRequest(`/storage/buckets/${id}?teamId=${activeTeam.id}`, { method: 'DELETE' }); fetchBuckets(); }
    catch (err: any) { alert(err.message || 'Failed to delete bucket. It must be empty first.'); }
  };

  const getUploadApiBase = () => {
    if (typeof window !== 'undefined' && window.location.hostname.endsWith('khawarahemad.com'))
      return 'https://api.khawarahemad.com/api';
    return 'http://localhost:5000/api';
  };

  const handleUploadFiles = async (fileList: FileList) => {
    if (!activeBucket || !activeTeam || fileList.length === 0) return;
    setUploading(true);
    const apiBase = getUploadApiBase();
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const formData = new FormData();
        formData.append('file', file);
        const key = currentPrefix ? `${currentPrefix}${file.name}` : file.name;
        await fetch(`${apiBase}/storage/buckets/${activeBucket.id}/upload?key=${encodeURIComponent(key)}&teamId=${activeTeam.id}`, { method: 'POST', body: formData });
      }
      fetchFiles(activeBucket.id, currentPrefix);
      fetchBuckets();
    } catch (err) { alert('Failed to upload some files.'); }
    finally { setUploading(false); }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !activeBucket || !activeTeam) return;
    setUploading(true);
    const apiBase = getUploadApiBase();
    try {
      const folderKey = currentPrefix ? `${currentPrefix}${newFolderName}/` : `${newFolderName}/`;
      const blob = new Blob([''], { type: 'application/x-directory' });
      const file = new (globalThis.File || Blob)([blob], '.placeholder') as globalThis.File;
      const formData = new FormData();
      formData.append('file', file);
      await fetch(`${apiBase}/storage/buckets/${activeBucket.id}/upload?key=${encodeURIComponent(folderKey)}&teamId=${activeTeam.id}`, { method: 'POST', body: formData });
      setNewFolderName(''); setFolderCreateOpen(false);
      fetchFiles(activeBucket.id, currentPrefix);
    } catch (err) { console.error('Folder creation failed:', err); }
    finally { setUploading(false); }
  };

  const handleDeleteFile = async (key: string) => {
    if (!activeBucket || !activeTeam || !confirm(`Delete "${key}" permanently?`)) return;
    try {
      await apiRequest(`/storage/buckets/${activeBucket.id}/files?key=${encodeURIComponent(key)}&teamId=${activeTeam.id}`, { method: 'DELETE' });
      fetchFiles(activeBucket.id, currentPrefix);
      fetchBuckets();
    } catch (err) { console.error(err); }
  };

  const handleOpenPreview = async (file: any) => {
    setPreviewFile(file);
    try {
      const res = await apiRequest(`/storage/buckets/${activeBucket.id}/presigned?key=${encodeURIComponent(file.key)}`);
      setPreviewUrl(res.url.startsWith('/api') ? `${getUploadApiBase()}${res.url.replace('/api', '')}` : res.url);
    } catch { setPreviewUrl(''); }
  };

  const handleCopy = (str: string, label: string) => {
    navigator.clipboard.writeText(str);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleCopyDirectLink = async (item: any) => {
    if (activeBucket.isPublic) {
      handleCopy(`https://storage.khawarahemad.com/${activeBucket.name}/${item.key}`, item.key);
    } else {
      try {
        const res = await apiRequest(`/storage/buckets/${activeBucket.id}/presigned?key=${encodeURIComponent(item.key)}&expiresIn=86400`);
        const fullUrl = res.url.startsWith('/api') ? `${getUploadApiBase().replace('/api', '')}${res.url}` : res.url;
        handleCopy(fullUrl, item.key);
      } catch { alert('Failed to generate presigned URL.'); }
    }
  };

  const formatBytes = (bytes: string | number) => {
    const num = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (isNaN(num) || num === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getDisplayItems = () => {
    const currentLevelKeys = new Set<string>();
    const displayFiles: any[] = [];
    files.forEach(f => {
      const relKey = currentPrefix ? f.key.substring(currentPrefix.length) : f.key;
      const parts = relKey.split('/');
      if (parts.length > 1) {
        const folderKey = currentPrefix ? `${currentPrefix}${parts[0]}/` : `${parts[0]}/`;
        if (!currentLevelKeys.has(folderKey)) { currentLevelKeys.add(folderKey); displayFiles.push({ key: folderKey, name: parts[0], isFolder: true }); }
      } else if (relKey && relKey !== '.placeholder') {
        displayFiles.push({ ...f, name: relKey, isFolder: false });
      }
    });
    if (searchQuery.trim()) return displayFiles.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return displayFiles;
  };

  const getBreadcrumbs = () => {
    if (!currentPrefix) return [];
    const parts = currentPrefix.split('/').filter(Boolean);
    let cumulative = '';
    return parts.map(p => { cumulative += p + '/'; return { name: p, prefix: cumulative }; });
  };

  const getSdkSnippet = () => {
    const bName = activeBucket?.name || 'assets-bucket';
    const s3Endpoint = 'https://storage.khawarahemad.com';
    const accessKey = `kh_acc_${activeBucket?.id?.substring(0, 8)}`;
    const secretKey = `kh_sec_${activeBucket?.id?.substring(8, 20)}`;
    if (sdkLanguage === 'node') return `import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";\n\nconst s3 = new S3Client({\n  endpoint: "${s3Endpoint}",\n  region: "us-east-1",\n  credentials: {\n    accessKeyId: "${accessKey}",\n    secretAccessKey: "${secretKey}",\n  },\n  forcePathStyle: true,\n});\n\nawait s3.send(new PutObjectCommand({\n  Bucket: "${bName}",\n  Key: "images/avatar.png",\n  Body: fileBuffer,\n  ContentType: "image/png",\n}));`;
    if (sdkLanguage === 'python') return `import boto3\n\ns3 = boto3.client(\n    's3',\n    endpoint_url='${s3Endpoint}',\n    aws_access_key_id='${accessKey}',\n    aws_secret_access_key='${secretKey}',\n    region_name='us-east-1'\n)\n\ns3.upload_file('avatar.png', '${bName}', 'images/avatar.png')`;
    if (sdkLanguage === 'go') return `cfg, _ := config.LoadDefaultConfig(context.TODO())\nclient := s3.NewFromConfig(cfg, func(o *s3.Options) {\n\to.BaseEndpoint = aws.String("${s3Endpoint}")\n\to.UsePathStyle = true\n})\n\nclient.PutObject(context.TODO(), &s3.PutObjectInput{\n\tBucket: aws.String("${bName}"),\n\tKey:    aws.String("images/avatar.png"),\n\tBody:   fileReader,\n})`;
    return `let config = s3::config::Builder::new()\n    .endpoint_url("${s3Endpoint}")\n    .build();\n\nlet client = s3::Client::from_conf(config);\n\nclient.put_object()\n    .bucket("${bName}")\n    .key("images/avatar.png")\n    .body(ByteStream::from(bytes))\n    .send().await?;`;
  };

  const displayItems = getDisplayItems();

  /* ─── UPGRADE GATE ─── */
  if (!billingLoading && billing?.subscription?.planId !== 'pro' && billing?.subscription?.planId !== 'enterprise') {
    return (
      <div className="rw-page">
        <div className="rw-page-header">
          <h1 className="rw-page-title">Object Storage</h1>
        </div>
        <div className="rw-page-content">
          <div className="rw-empty" style={{ maxWidth: '440px', margin: '40px auto' }}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '14px',
              backgroundColor: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <HardDrive size={22} style={{ color: '#a78bfa' }} />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#f1f3f6' }}>Object storage is a Pro feature</h3>
            <p style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center', maxWidth: '320px' }}>
              Store and serve files, images, backups, and static assets with S3 compatibility. Upgrade to unlock high-performance Object Storage.
            </p>
            <div style={{ width: '100%', backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '10px' }}>What you get</div>
              {['MinIO/S3 compatible storage', 'Global CDN acceleration', 'Presigned URL generation', 'Granular API access keys'].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px', fontSize: '13px', color: '#9ba3af' }}>
                  <Check size={12} style={{ color: '#7c3aed', flexShrink: 0 }} /> {f}
                </div>
              ))}
            </div>
            <button onClick={() => setActiveTab('billing')} className="rw-btn-primary rw-btn-lg">
              <Zap size={14} /> Upgrade to Pro
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rw-page">
      {/* Header */}
      <div className="rw-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeBucket && (
            <button
              onClick={() => { setActiveBucket(null); setCurrentPrefix(''); }}
              style={{
                width: '30px', height: '30px', borderRadius: '7px',
                backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.09)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#9ba3af', cursor: 'pointer',
              }}
            ><ArrowLeft size={13} /></button>
          )}
          <div>
            <h1 className="rw-page-title">{activeBucket ? activeBucket.name : 'Object Storage'}</h1>
            <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
              {activeBucket ? `S3-compatible bucket · ${activeBucket.isPublic ? 'Public' : 'Private'}` : 'Managed S3-compatible storage buckets'}
            </p>
          </div>
        </div>
        {!activeBucket && (
          <button onClick={() => setCreateOpen(true)} className="rw-btn-primary"><Plus size={13} /> Create bucket</button>
        )}
        {activeBucket && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setFolderCreateOpen(true)} className="rw-btn-secondary"><Plus size={13} /> New folder</button>
            <input type="file" multiple ref={fileInputRef} onChange={e => { if (e.target.files) handleUploadFiles(e.target.files); }} className="hidden" style={{ display: 'none' }} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rw-btn-primary">
              <Upload size={13} /> {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="rw-page-content">
        {billingLoading || loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', gap: '12px', color: '#6b7280' }}>
            <Loader2 size={18} className="animate-spin" style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: '13px' }}>Loading storage...</span>
          </div>
        ) : !activeBucket ? (
          /* BUCKETS LIST */
          buckets.length === 0 ? (
            <div className="rw-empty">
              <div className="rw-empty-icon"><HardDrive size={20} style={{ color: '#6b7280' }} /></div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f3f6' }}>No storage buckets</h3>
              <p style={{ fontSize: '13px', color: '#6b7280', maxWidth: '320px' }}>Create S3-compatible object storage buckets for assets, media, and backups.</p>
              <button onClick={() => setCreateOpen(true)} className="rw-btn-primary rw-btn-lg" style={{ marginTop: '4px' }}><Plus size={14} /> Create first bucket</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {buckets.map(b => (
                <div key={b.id} onClick={() => setActiveBucket(b)} className="rw-card-interactive" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <HardDrive size={13} style={{ color: '#6b7280' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#f1f3f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{b.name}</div>
                        <div style={{ fontSize: '10px', color: '#4b5563', marginTop: '1px', fontFamily: 'monospace' }}>storage.khawarahemad.com</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '2px 7px', borderRadius: '9999px', fontSize: '10px', fontWeight: 500,
                        backgroundColor: b.isPublic ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.15)',
                        color: b.isPublic ? '#22c55e' : '#6b7280',
                        border: `1px solid ${b.isPublic ? 'rgba(34,197,94,0.2)' : 'rgba(107,114,128,0.2)'}`,
                      }}>
                        {b.isPublic ? <Globe size={9} /> : <Lock size={9} />}
                        {b.isPublic ? 'Public' : 'Private'}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteBucket(b.id); }}
                        style={{
                          width: '24px', height: '24px', borderRadius: '6px',
                          backgroundColor: 'transparent', border: '1px solid transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#4b5563', cursor: 'pointer', transition: 'all 0.12s',
                        }}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = 'rgba(239,68,68,0.1)'; el.style.borderColor = 'rgba(239,68,68,0.2)'; el.style.color = '#ef4444'; }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = 'transparent'; el.style.borderColor = 'transparent'; el.style.color = '#4b5563'; }}
                      ><Trash size={11} /></button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#6b7280' }}>
                    <span>{formatBytes(b.sizeUsed || 0)} used</span>
                    <span>·</span>
                    <span>{b.fileCount || 0} files</span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* BUCKET EXPLORER */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>
            {/* File explorer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Search + breadcrumbs */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#4b5563' }} />
                  <input
                    type="text"
                    placeholder="Search objects..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="rw-input"
                    style={{ paddingLeft: '30px' }}
                  />
                </div>
              </div>

              {/* Breadcrumbs */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap',
                padding: '7px 12px', borderRadius: '8px',
                backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)',
                fontSize: '12px', fontWeight: 500,
              }}>
                <button onClick={() => setCurrentPrefix('')} style={{ color: '#9ba3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0' }}>root</button>
                {getBreadcrumbs().map((bc, idx) => (
                  <React.Fragment key={idx}>
                    <span style={{ color: '#4b5563' }}>/</span>
                    <button onClick={() => setCurrentPrefix(bc.prefix)} style={{ color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: '0' }}>{bc.name}</button>
                  </React.Fragment>
                ))}
              </div>

              {/* Drop zone / file table */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) handleUploadFiles(e.dataTransfer.files); }}
                style={{
                  minHeight: '360px', borderRadius: '10px',
                  border: dragOver ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.07)',
                  backgroundColor: dragOver ? 'rgba(124,58,237,0.06)' : '#111318',
                  overflow: 'hidden', transition: 'all 0.15s',
                }}
              >
                {filesLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '10px', color: '#6b7280' }}>
                    <Loader2 size={16} className="animate-spin" style={{ color: '#7c3aed' }} /><span style={{ fontSize: '13px' }}>Loading files...</span>
                  </div>
                ) : displayItems.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', color: '#4b5563', textAlign: 'center' }}>
                    <Upload size={28} style={{ marginBottom: '10px', opacity: 0.4 }} />
                    <p style={{ fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>Drag & drop files to upload</p>
                    <p style={{ fontSize: '11px', marginTop: '4px' }}>or click the Upload button</p>
                  </div>
                ) : (
                  <table className="rw-table" style={{ margin: 0 }}>
                    <thead><tr>
                      <th>Name</th><th>Size</th><th>Type</th><th>Modified</th><th style={{ textAlign: 'right' }}>Actions</th>
                    </tr></thead>
                    <tbody>
                      {displayItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <button
                              onClick={() => item.isFolder ? setCurrentPrefix(item.key) : handleOpenPreview(item)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#f1f3f6', fontSize: '13px', fontWeight: 500, padding: '0',
                                maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}
                            >
                              {item.isFolder ? <Folder size={14} style={{ color: '#a78bfa', flexShrink: 0 }} /> : <FileIcon size={14} style={{ color: '#6b7280', flexShrink: 0 }} />}
                              {item.name}
                            </button>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{item.isFolder ? '—' : formatBytes(item.size)}</td>
                          <td>
                            <span style={{
                              padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 500,
                              backgroundColor: item.isFolder ? 'rgba(124,58,237,0.1)' : '#181b22',
                              color: item.isFolder ? '#a78bfa' : '#6b7280',
                              textTransform: 'uppercase', letterSpacing: '0.04em',
                            }}>{item.isFolder ? 'dir' : (item.contentType?.split('/')[1] || 'file')}</span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                            {!item.isFolder && item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '—'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                              {!item.isFolder && (
                                <>
                                  <button onClick={() => handleOpenPreview(item)} style={{ width: '24px', height: '24px', borderRadius: '5px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }} title="Preview"><Eye size={12} /></button>
                                  <button onClick={() => handleCopyDirectLink(item)} style={{ width: '24px', height: '24px', borderRadius: '5px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }} title="Copy URL"><Link size={12} /></button>
                                </>
                              )}
                              <button onClick={() => handleDeleteFile(item.key)} style={{ width: '24px', height: '24px', borderRadius: '5px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563' }} title="Delete"><Trash size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Developer panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'sticky', top: '24px' }}>
              {/* S3 Config */}
              <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '14px', fontSize: '12px', fontWeight: 600, color: '#f1f3f6' }}>
                  <Code size={13} style={{ color: '#a78bfa' }} /> S3 Configuration
                </div>
                {[
                  { label: 'Endpoint', value: 'https://storage.khawarahemad.com', id: 'endpoint' },
                  { label: 'Access Key', value: `kh_acc_${activeBucket.id.substring(0, 8)}`, id: 'accessKey' },
                ].map(({ label, value, id }) => (
                  <div key={id} style={{ marginBottom: '10px' }}>
                    <div className="rw-label">{label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '7px', padding: '7px 10px' }}>
                      <code style={{ flex: 1, fontSize: '10px', fontFamily: 'monospace', color: '#9ba3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</code>
                      <button onClick={() => handleCopy(value, id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedText === id ? '#22c55e' : '#4b5563', display: 'flex' }}>
                        {copiedText === id ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    </div>
                  </div>
                ))}
                <div>
                  <div className="rw-label">Secret Key</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '7px', padding: '7px 10px' }}>
                    <input type={showSecret ? 'text' : 'password'} readOnly value={`kh_sec_${activeBucket.id.substring(8, 20)}`}
                      style={{ flex: 1, fontSize: '10px', fontFamily: 'monospace', color: '#9ba3af', background: 'none', border: 'none', outline: 'none', minWidth: 0 }} />
                    <button onClick={() => setShowSecret(!showSecret)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', display: 'flex' }}>
                      {showSecret ? <EyeOff size={11} /> : <Eye size={11} />}
                    </button>
                    <button onClick={() => handleCopy(`kh_sec_${activeBucket.id.substring(8, 20)}`, 'secret')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedText === 'secret' ? '#22c55e' : '#4b5563', display: 'flex' }}>
                      {copiedText === 'secret' ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* SDK snippets */}
              <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#f1f3f6', marginBottom: '10px' }}>SDK Examples</div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  {(['node', 'python', 'go', 'rust'] as const).map(lang => (
                    <button key={lang} onClick={() => setSdkLanguage(lang)}
                      style={{
                        padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 500, cursor: 'pointer', border: 'none',
                        backgroundColor: sdkLanguage === lang ? 'rgba(124,58,237,0.15)' : 'transparent',
                        color: sdkLanguage === lang ? '#c4b5fd' : '#6b7280',
                        textTransform: 'capitalize',
                      }}>
                      {lang === 'node' ? 'Node.js' : lang}
                    </button>
                  ))}
                </div>
                <div style={{ position: 'relative' }}>
                  <pre style={{
                    backgroundColor: '#0e1015', borderRadius: '7px', padding: '10px', fontSize: '10px',
                    fontFamily: 'monospace', color: '#d1d5db', whiteSpace: 'pre', overflow: 'auto',
                    maxHeight: '200px', margin: 0,
                  }}>{getSdkSnippet()}</pre>
                  <button onClick={() => handleCopy(getSdkSnippet(), 'sdk')}
                    style={{
                      position: 'absolute', top: '6px', right: '6px',
                      width: '22px', height: '22px', borderRadius: '5px',
                      backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.07)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: copiedText === 'sdk' ? '#22c55e' : '#6b7280', cursor: 'pointer',
                    }}>
                    {copiedText === 'sdk' ? <Check size={10} /> : <Copy size={10} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Bucket Modal */}
      {createOpen && (
        <div className="rw-modal-backdrop">
          <div className="rw-modal animate-scale-in">
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f3f6', marginBottom: '6px' }}>Create bucket</h3>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>Provision S3-compatible object storage.</p>
            <form onSubmit={handleCreateBucket}>
              <div style={{ marginBottom: '14px' }}>
                <label className="rw-label">Bucket name</label>
                <input type="text" required value={bucketName} onChange={e => setBucketName(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))} placeholder="e.g. assets-archive" className="rw-input" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.07)', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#f1f3f6' }}>Public bucket</div>
                  <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>Allow anonymous HTTP reads</div>
                </div>
                <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7c3aed' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setCreateOpen(false)} className="rw-btn-secondary">Cancel</button>
                <button type="submit" className="rw-btn-primary">Create bucket</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {folderCreateOpen && (
        <div className="rw-modal-backdrop">
          <div className="rw-modal animate-scale-in">
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f3f6', marginBottom: '6px' }}>Create folder</h3>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>Virtual directory in the current prefix.</p>
            <form onSubmit={handleCreateFolder}>
              <div style={{ marginBottom: '20px' }}>
                <label className="rw-label">Folder name</label>
                <input type="text" required value={newFolderName} onChange={e => setNewFolderName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))} placeholder="e.g. photos" className="rw-input" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setFolderCreateOpen(false)} className="rw-btn-secondary">Cancel</button>
                <button type="submit" disabled={uploading} className="rw-btn-primary">
                  {uploading && <Loader2 size={12} className="animate-spin" />} Create folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="rw-modal-backdrop">
          <div style={{
            backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px',
            width: '100%', maxWidth: '600px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, color: '#f1f3f6', overflow: 'hidden' }}>
                <FileIcon size={13} style={{ color: '#a78bfa', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewFile.key}</span>
              </div>
              <button onClick={() => { setPreviewFile(null); setPreviewUrl(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '16px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '280px', backgroundColor: '#0e1015' }}>
              {previewFile.contentType?.startsWith('image/') ? (
                <img src={previewUrl} alt={previewFile.key} style={{ maxHeight: '400px', objectFit: 'contain', borderRadius: '8px' }} />
              ) : previewFile.contentType?.startsWith('video/') ? (
                <video src={previewUrl} controls style={{ maxHeight: '400px', width: '100%', borderRadius: '8px' }} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#6b7280' }}>
                  {previewFile.contentType === 'application/pdf' ? <BookOpen size={40} style={{ opacity: 0.3 }} /> : <FileIcon size={40} style={{ opacity: 0.3 }} />}
                  <span style={{ fontSize: '13px' }}>{previewFile.contentType}</span>
                  <a href={previewUrl} download className="rw-btn-primary rw-btn-lg" style={{ textDecoration: 'none' }}><Download size={13} /> Download</a>
                </div>
              )}
            </div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#4b5563', fontFamily: 'monospace', flexShrink: 0 }}>
              <span>Size: {formatBytes(previewFile.size)}</span>
              <span>{previewFile.contentType}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
