'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { HardDrive, Plus, Folder, File, ArrowLeft, Loader2, Upload, Trash, Copy, Check, Eye, Download, Code, Sparkles, BookOpen, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function StorageTab() {
  const { activeTeam, setActiveTab } = useAppStore();
  
  // Bucket list state
  const [buckets, setBuckets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<any | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [bucketName, setBucketName] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  // Active bucket details state
  const [activeBucket, setActiveBucket] = useState<any | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Upload/Drag-drop state
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Previews
  const [previewFile, setPreviewFile] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  // SDK snippets tab selector
  const [sdkLanguage, setSdkLanguage] = useState<'node' | 'python' | 'go' | 'rust'>('node');

  // Copy success indicator
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const fetchBuckets = async () => {
    if (!activeTeam) return;
    setLoading(true);
    try {
      const data = await apiRequest(`/storage/buckets?teamId=${activeTeam.id}`);
      setBuckets(data);
    } catch (err) {
      setBuckets([
        { id: 'b-1', name: 'assets-bucket', isPublic: true, sizeUsed: '1249822', fileCount: 4, status: 'ACTIVE' },
        { id: 'b-2', name: 'reports-archive', isPublic: false, sizeUsed: '8910', fileCount: 1, status: 'ACTIVE' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFiles = async (bucketId: string, prefix = '') => {
    setFilesLoading(true);
    try {
      const data = await apiRequest(`/storage/buckets/${bucketId}/files?prefix=${prefix}`);
      setFiles(data);
    } catch (err) {
      // Mock files fallback
      setFiles([
        { id: 'f-1', key: 'images/banner.webp', size: '1048576', contentType: 'image/webp', isFolder: false, updatedAt: new Date().toISOString() },
        { id: 'f-2', key: 'docs/invoice.pdf', size: '201934', contentType: 'application/pdf', isFolder: false, updatedAt: new Date().toISOString() },
        { id: 'f-3', key: 'data/metadata.json', size: '4822', contentType: 'application/json', isFolder: false, updatedAt: new Date().toISOString() },
        { id: 'f-4', key: 'videos/tutorial.mp4', size: '8910822', contentType: 'video/mp4', isFolder: false, updatedAt: new Date().toISOString() },
      ]);
    } finally {
      setFilesLoading(false);
    }
  };

  const fetchBillingInfo = async () => {
    if (!activeTeam) return;
    setBillingLoading(true);
    try {
      const data = await apiRequest(`/billing?teamId=${activeTeam.id}`);
      setBilling(data);
    } catch (err) {
      setBilling({
        subscription: { planId: 'hobby' }
      });
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    fetchBuckets();
    fetchBillingInfo();
  }, [activeTeam]);

  useEffect(() => {
    if (activeBucket) {
      fetchFiles(activeBucket.id, currentPrefix);
    }
  }, [activeBucket, currentPrefix]);

  const handleCreateBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bucketName.trim() || !activeTeam) return;

    try {
      await apiRequest('/storage/buckets', {
        method: 'POST',
        body: JSON.stringify({
          name: bucketName,
          isPublic,
          teamId: activeTeam.id,
        }),
      });
      setBucketName('');
      setIsPublic(false);
      setCreateOpen(false);
      fetchBuckets();
    } catch (err: any) {
      alert(err.message || 'Failed to create bucket.');
    }
  };

  const handleDeleteBucket = async (id: string) => {
    if (!activeTeam) return;
    if (!confirm('Are you sure you want to permanently delete this bucket?')) return;
    try {
      await apiRequest(`/storage/buckets/${id}?teamId=${activeTeam.id}`, {
        method: 'DELETE',
      });
      fetchBuckets();
    } catch (err: any) {
      alert(err.message || 'Failed to delete bucket. Note: bucket must be empty first.');
    }
  };

  // Upload handlers
  const handleUploadFiles = async (fileList: FileList) => {
    if (!activeBucket || !activeTeam || fileList.length === 0) return;
    setUploading(true);

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const formData = new FormData();
        formData.append('file', file);
        
        const key = currentPrefix ? `${currentPrefix}${file.name}` : file.name;

        await fetch(`http://localhost:5000/api/storage/buckets/${activeBucket.id}/upload?key=${encodeURIComponent(key)}&teamId=${activeTeam.id}`, {
          method: 'POST',
          body: formData,
        });
      }
      // Refresh bucket files and buckets size
      fetchFiles(activeBucket.id, currentPrefix);
      fetchBuckets();
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => {
    setDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  const handleDeleteFile = async (key: string) => {
    if (!activeBucket || !activeTeam) return;
    if (!confirm(`Are you sure you want to delete "${key}"?`)) return;

    try {
      await apiRequest(`/storage/buckets/${activeBucket.id}/files?key=${encodeURIComponent(key)}&teamId=${activeTeam.id}`, {
        method: 'DELETE',
      });
      fetchFiles(activeBucket.id, currentPrefix);
      fetchBuckets();
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenPreview = async (file: any) => {
    setPreviewFile(file);
    try {
      // Get signed/download url
      const res = await apiRequest(`/storage/buckets/${activeBucket.id}/presigned?key=${encodeURIComponent(file.key)}`);
      // Since backend runs on port 5000, map local relative endpoints to full URL
      if (res.url.startsWith('/api')) {
        setPreviewUrl(`http://localhost:5000${res.url}`);
      } else {
        setPreviewUrl(res.url);
      }
    } catch (err) {
      setPreviewUrl('');
    }
  };

  const handleCopy = (str: string, label: string) => {
    navigator.clipboard.writeText(str);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Format bytes
  const formatBytes = (bytes: string | number) => {
    const num = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (isNaN(num) || num === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Virtual directories list
  const getDisplayItems = () => {
    const currentLevelKeys = new Set<string>();
    const displayFiles: any[] = [];

    files.forEach(f => {
      // Relative key within current prefix
      const relKey = currentPrefix ? f.key.substring(currentPrefix.length) : f.key;
      const parts = relKey.split('/');

      if (parts.length > 1) {
        // Virtual directory
        const folderName = parts[0] + '/';
        const folderKey = currentPrefix ? `${currentPrefix}${folderName}` : folderName;
        if (!currentLevelKeys.has(folderKey)) {
          currentLevelKeys.add(folderKey);
          displayFiles.push({
            key: folderKey,
            name: parts[0],
            isFolder: true,
          });
        }
      } else if (relKey) {
        // File
        displayFiles.push({
          ...f,
          name: relKey,
          isFolder: false,
        });
      }
    });

    // Filter by search
    if (searchQuery.trim()) {
      return displayFiles.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    return displayFiles;
  };

  // Breadcrumbs parsing
  const getBreadcrumbs = () => {
    if (!currentPrefix) return [];
    const parts = currentPrefix.split('/').filter(Boolean);
    let cumulative = '';
    return parts.map(p => {
      cumulative += p + '/';
      return { name: p, prefix: cumulative };
    });
  };

  // SDK snippets definitions
  const getSdkSnippet = () => {
    const bName = activeBucket?.name || 'assets-bucket';
    const s3Endpoint = 'https://storage.khawarahemad.com';
    const accessKey = 'kh_acc_' + activeBucket?.id?.substring(0, 8);
    const secretKey = 'kh_sec_' + activeBucket?.id?.substring(8, 20);

    if (sdkLanguage === 'node') {
      return `import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: "${s3Endpoint}",
  region: "us-east-1",
  credentials: {
    accessKeyId: "${accessKey}",
    secretAccessKey: "${secretKey}",
  },
  forcePathStyle: true,
});

await s3.send(new PutObjectCommand({
  Bucket: "${bName}",
  Key: "images/avatar.png",
  Body: fileBuffer,
  ContentType: "image/png",
}));`;
    } else if (sdkLanguage === 'python') {
      return `import boto3

s3 = boto3.client(
    's3',
    endpoint_url='${s3Endpoint}',
    aws_access_key_id='${accessKey}',
    aws_secret_access_key='${secretKey}',
    region_name='us-east-1'
)

s3.upload_file('avatar.png', '${bName}', 'images/avatar.png')`;
    } else if (sdkLanguage === 'go') {
      return `import (
	"context"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

cfg, _ := config.LoadDefaultConfig(context.TODO())
client := s3.NewFromConfig(cfg, func(o *s3.Options) {
	o.BaseEndpoint = aws.String("${s3Endpoint}")
	o.UsePathStyle = true
})

client.PutObject(context.TODO(), &s3.PutObjectInput{
	Bucket: aws.String("${bName}"),
	Key:    aws.String("images/avatar.png"),
	Body:   fileReader,
})`;
    } else {
      return `use aws_sdk_s3 as s3;

let config = s3::config::Builder::new()
    .endpoint_url("${s3Endpoint}")
    .behavior_version_latest()
    .build();

let client = s3::Client::from_conf(config);

client.put_object()
    .bucket("${bName}")
    .key("images/avatar.png")
    .body(s3::primitives::ByteStream::from(file_vec))
    .send()
    .await?;`;
    }
  };

  const displayItems = getDisplayItems();

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#030303]">
      {/* Header */}
      <div className="h-16 border-b border-white/5 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {activeBucket && (
            <button
              onClick={() => {
                setActiveBucket(null);
                setCurrentPrefix('');
              }}
              className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <h2 className="text-sm font-bold tracking-tight">
            {activeBucket ? `Bucket Explorer: ${activeBucket.name}` : 'Object Storage Buckets'}
          </h2>
        </div>

        {!activeBucket && (
          <button
            onClick={() => setCreateOpen(true)}
            className="h-9 px-3.5 rounded-lg bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors flex items-center gap-1.5 active:scale-95 duration-100"
          >
            <Plus size={14} />
            Create Bucket
          </button>
        )}
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-6">
        {billingLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <Loader2 className="animate-spin text-indigo-400" size={32} />
            <span className="text-xs">Checking subscription plan...</span>
          </div>
        ) : (billing?.subscription?.planId !== 'pro' && billing?.subscription?.planId !== 'enterprise') ? (
          <div className="flex flex-col items-center justify-center py-16 text-center max-w-xl mx-auto">
            <div className="relative mb-6 text-indigo-400">
              <div className="absolute inset-0 rounded-3xl bg-indigo-500/20 blur-xl animate-pulse"></div>
              <div className="relative w-16 h-16 rounded-3xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                <Sparkles size={28} className="animate-bounce" />
              </div>
            </div>
            
            <h3 className="font-extrabold text-xl mb-2 text-white">Object Storage is a Pro Feature</h3>
            <p className="text-xs text-zinc-400 max-w-sm mb-8 leading-relaxed">
              Store and serve files, images, database backups, and static assets globally with S3 compatibility. Upgrade your team subscription to unlock high-performance Object Storage.
            </p>

            <div className="w-full bg-white/[0.02] border border-white/5 rounded-2xl p-5 mb-8 text-left space-y-3.5">
              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Plan Benefits Included:</div>
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                <div className="flex items-center gap-2 text-zinc-300">
                  <span className="text-indigo-400">✓</span> High-performance MinIO/S3 compatible storage
                </div>
                <div className="flex items-center gap-2 text-zinc-300">
                  <span className="text-indigo-400">✓</span> Global Traefik routing with CDN acceleration
                </div>
                <div className="flex items-center gap-2 text-zinc-300">
                  <span className="text-indigo-400">✓</span> Automatic Image optimization & webp conversion
                </div>
                <div className="flex items-center gap-2 text-zinc-300">
                  <span className="text-indigo-400">✓</span> Granular Read/Write API Access Keys
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('billing')}
              className="h-10 px-6 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-xs transition-all shadow-md shadow-indigo-500/10 active:scale-95 duration-100 flex items-center gap-2"
            >
              <Zap size={12} className="text-white" />
              Upgrade to Pro Plan
            </button>
          </div>
        ) : (
          <>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
                <Loader2 className="animate-spin text-indigo-400" size={32} />
                <span className="text-xs">Fetching storage buckets...</span>
              </div>
        ) : !activeBucket ? (
          /* BUCKETS GRID LIST */
          buckets.length === 0 ? (
            <div className="flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl py-20 text-center glass-card max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-zinc-500 mb-4">
                <HardDrive size={20} />
              </div>
              <h3 className="font-bold text-sm mb-1">No Storage Buckets active</h3>
              <p className="text-xs text-zinc-400 max-w-xs mb-6">Create fully managed, S3 compatible object storage buckets to hold application assets, media and backups.</p>
              <button
                onClick={() => setCreateOpen(true)}
                className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs transition-colors active:scale-95"
              >
                Provision first bucket
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
              {buckets.map((b) => (
                <div
                  key={b.id}
                  onClick={() => setActiveBucket(b)}
                  className="glass-card p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-all cursor-pointer flex flex-col justify-between h-44 active:scale-[0.98]"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-white truncate max-w-[150px]">{b.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                        b.isPublic ? 'bg-indigo-500/10 text-indigo-400' : 'bg-zinc-500/10 text-zinc-400'
                      }`}>
                        {b.isPublic ? 'PUBLIC' : 'PRIVATE'}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-2 font-medium">
                      Endpoint: storage.khawarahemad.com
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-4 flex items-center justify-between text-[10px] text-zinc-400">
                    <div className="flex items-center gap-4">
                      <span>{formatBytes(b.sizeUsed || 0)} used</span>
                      <span>•</span>
                      <span>{b.fileCount || 0} files</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBucket(b.id);
                      }}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* BUCKET EXPLORER & DEVELOPER DOCUMENTATION */
          <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-8">
            
            {/* FILE EXPLORER AREA (2 Cols) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Explorer Control Bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                
                {/* Search */}
                <input
                  type="text"
                  placeholder="Search objects in folder..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 px-3 rounded-lg glass-input text-xs text-white max-w-sm flex-1"
                />

                {/* Upload Action */}
                <div className="flex gap-2">
                  <input
                    type="file"
                    multiple
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files) handleUploadFiles(e.target.files);
                    }}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="h-9 px-3.5 rounded-lg border border-white/10 hover:bg-white/5 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Upload size={14} />
                    {uploading ? 'Uploading...' : 'Upload File'}
                  </button>
                </div>
              </div>

              {/* Explorer Breadcrumbs */}
              <div className="flex items-center gap-1 text-xs text-zinc-400 font-semibold select-none">
                <button
                  onClick={() => setCurrentPrefix('')}
                  className="hover:text-white transition-colors"
                >
                  root
                </button>
                {getBreadcrumbs().map((bc, idx) => (
                  <React.Fragment key={idx}>
                    <span className="text-zinc-600">/</span>
                    <button
                      onClick={() => setCurrentPrefix(bc.prefix)}
                      className="hover:text-white transition-colors"
                    >
                      {bc.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Drag Over Dropzone Area */}
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`border rounded-2xl p-6 min-h-[300px] flex flex-col transition-all relative ${
                  dragOver
                    ? 'border-indigo-500 bg-indigo-500/5'
                    : 'border-white/5 bg-white/[0.01] hover:border-white/10'
                }`}
              >
                {filesLoading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-3">
                    <Loader2 className="animate-spin text-indigo-400" size={24} />
                  </div>
                ) : displayItems.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500 py-12">
                    <Upload size={24} className="opacity-40 mb-3" />
                    <p className="text-xs">Drag and drop files here to upload, or use the Upload button.</p>
                  </div>
                ) : (
                  <div className="w-full divide-y divide-white/5">
                    {displayItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="py-3 flex items-center justify-between text-xs hover:bg-white/[0.01] transition-colors rounded px-2"
                      >
                        <div
                          className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                          onClick={() => {
                            if (item.isFolder) {
                              setCurrentPrefix(item.key);
                            } else {
                              handleOpenPreview(item);
                            }
                          }}
                        >
                          {item.isFolder ? (
                            <Folder className="text-indigo-400 shrink-0" size={16} />
                          ) : (
                            <File className="text-zinc-400 shrink-0" size={16} />
                          )}
                          <span className="font-semibold text-zinc-300 truncate max-w-sm hover:text-white transition-colors">
                            {item.name}
                          </span>
                        </div>

                        {!item.isFolder && (
                          <div className="flex items-center gap-4 text-zinc-500">
                            <span className="font-mono text-[10px] hidden sm:inline">{formatBytes(item.size)}</span>
                            
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleOpenPreview(item)}
                                className="p-1 rounded hover:bg-white/5 text-zinc-400 hover:text-white"
                                title="Preview"
                              >
                                <Eye size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteFile(item.key)}
                                className="p-1 rounded hover:bg-white/5 text-zinc-400 hover:text-red-400"
                                title="Delete"
                              >
                                <Trash size={12} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* DEVELOPER PANEL / SDK CLIENTS (1 Col) */}
            <div className="space-y-6">
              {/* Endpoint configuration card */}
              <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <Code size={16} className="text-indigo-400" />
                  S3 Endpoint Configuration
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">S3 Endpoint</label>
                    <div className="flex items-center gap-2 bg-[#050507] border border-white/5 rounded-lg px-3 py-1.5 text-[10px] font-mono text-zinc-300">
                      <span className="truncate flex-1">https://storage.khawarahemad.com</span>
                      <button onClick={() => handleCopy('https://storage.khawarahemad.com', 'endpoint')} className="text-zinc-500 hover:text-white">
                        {copiedText === 'endpoint' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Access Key ID</label>
                    <div className="flex items-center gap-2 bg-[#050507] border border-white/5 rounded-lg px-3 py-1.5 text-[10px] font-mono text-zinc-300">
                      <span className="truncate flex-1">{`kh_acc_${activeBucket.id.substring(0, 8)}`}</span>
                      <button onClick={() => handleCopy(`kh_acc_${activeBucket.id.substring(0, 8)}`, 'accessKey')} className="text-zinc-500 hover:text-white">
                        {copiedText === 'accessKey' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SDK Code Snippets Generator */}
              <div className="glass-card p-6 rounded-2xl border border-white/5 flex flex-col h-[270px]">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <Sparkles size={16} className="text-purple-400" />
                    SDK Client Examples
                  </div>
                </div>

                {/* Language tab selector */}
                <div className="flex gap-2 border-b border-white/5 text-[10px] font-bold pb-2 shrink-0">
                  {(['node', 'python', 'go', 'rust'] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setSdkLanguage(lang)}
                      className={`px-2 py-0.5 rounded capitalize ${
                        sdkLanguage === lang ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {lang === 'node' ? 'Node.js' : lang}
                    </button>
                  ))}
                </div>

                {/* Code viewport */}
                <div className="flex-1 bg-[#020203] rounded-lg p-4 font-mono text-[9px] text-zinc-300 overflow-auto border border-white/5 mt-3 relative select-text whitespace-pre">
                  <button
                    onClick={() => handleCopy(getSdkSnippet(), 'sdk')}
                    className="absolute top-2 right-2 bg-white/5 border border-white/10 p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                  >
                    {copiedText === 'sdk' ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                  </button>
                  {getSdkSnippet()}
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    )}
  </div>

      {/* Bucket Creation Modal */}
      {createOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="glass p-6 rounded-2xl max-w-sm w-full border border-white/10 shadow-2xl">
            <h3 className="text-base font-bold mb-1">Create Managed Bucket</h3>
            <p className="text-xs text-zinc-400 mb-4">Provision S3-compatible cloud object storage.</p>

            <form onSubmit={handleCreateBucket} className="space-y-4">
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Bucket Name</label>
                <input
                  type="text"
                  required
                  value={bucketName}
                  onChange={(e) => setBucketName(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))}
                  placeholder="e.g. assets-archive"
                  className="w-full h-10 px-3 rounded-xl glass-input text-sm text-white"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.01]">
                <div>
                  <span className="text-xs font-bold text-white block">Public Bucket</span>
                  <span className="text-[9px] text-zinc-500">Allow anonymous direct HTTP reads.</span>
                </div>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-500 focus:ring-0 focus:ring-offset-0"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs active:scale-95"
                >
                  Provision Bucket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Asset File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="glass rounded-2xl max-w-xl w-full border border-white/10 shadow-2xl flex flex-col overflow-hidden max-h-[600px]">
            <div className="h-14 border-b border-white/5 px-6 flex items-center justify-between shrink-0 bg-black/40">
              <div className="flex items-center gap-2">
                <File size={16} className="text-indigo-400" />
                <h3 className="text-xs font-bold truncate max-w-sm">{previewFile.key}</h3>
              </div>
              <button
                onClick={() => {
                  setPreviewFile(null);
                  setPreviewUrl('');
                }}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 p-6 flex items-center justify-center bg-black/20 overflow-auto min-h-[300px]">
              {previewFile.contentType?.startsWith('image/') ? (
                <img
                  src={previewUrl}
                  alt={previewFile.key}
                  className="max-h-[350px] object-contain rounded border border-white/5"
                />
              ) : previewFile.contentType?.startsWith('video/') ? (
                <video
                  src={previewUrl}
                  controls
                  className="max-h-[350px] w-full rounded border border-white/5"
                />
              ) : previewFile.contentType === 'application/pdf' ? (
                <div className="flex flex-col items-center text-zinc-500 text-xs gap-3">
                  <BookOpen size={48} className="opacity-40" />
                  <span>PDF Document Preview is supported on downloads.</span>
                  <a
                    href={previewUrl}
                    download
                    className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs flex items-center gap-1.5"
                  >
                    <Download size={14} />
                    Download PDF
                  </a>
                </div>
              ) : (
                <div className="flex flex-col items-center text-zinc-500 text-xs gap-3">
                  <File size={48} className="opacity-40" />
                  <span>Binary asset ({previewFile.contentType})</span>
                  <a
                    href={previewUrl}
                    download
                    className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs flex items-center gap-1.5"
                  >
                    <Download size={14} />
                    Download File
                  </a>
                </div>
              )}
            </div>

            <div className="h-12 border-t border-white/5 px-6 flex items-center justify-between text-[10px] text-zinc-400 bg-black/40 shrink-0 font-semibold font-mono">
              <span>Size: {formatBytes(previewFile.size)}</span>
              <span>Content-Type: {previewFile.contentType}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
