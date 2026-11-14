import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderArchive, UploadCloud, Image as ImageIcon, FileText, File, Copy, 
  Check, Trash2, Search, RefreshCw, ExternalLink, Filter, HardDrive, 
  AlertCircle, CheckCircle2, Eye, X
} from 'lucide-react';
import { API_BASE, safeReadJson } from '../../api/client';

export default function AdminMediaDrive() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // all, image, pdf, raw
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null); // { type, message }
  const [copiedId, setCopiedId] = useState(null); // id_type
  const [previewModalAsset, setPreviewModalAsset] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (activeTab !== 'all') queryParams.set('type', activeTab);
      if (searchQuery.trim()) queryParams.set('search', searchQuery.trim());
      queryParams.set('limit', '100');

      const res = await fetch(`${API_BASE}/admin/media?${queryParams.toString()}`);
      const data = await safeReadJson(res);
      if (res.ok && data?.success) {
        setAssets(data.assets || []);
      } else {
        showNotification(data?.error || 'Failed to load media assets', 'error');
      }
    } catch (err) {
      console.error("Fetch media assets failed:", err);
      showNotification('Network error loading assets', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [activeTab]);

  // Handle live search with simple debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAssets();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Global Clipboard Paste Listener for screenshots / copied files
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const filesToUpload = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) filesToUpload.push(file);
        }
      }

      if (filesToUpload.length > 0) {
        handleUploadFiles(filesToUpload);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleUploadFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const filesArray = Array.from(fileList);
    setUploading(true);

    const formData = new FormData();
    filesArray.forEach(file => {
      formData.append('files', file);
    });

    try {
      const res = await fetch(`${API_BASE}/admin/media/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await safeReadJson(res);

      if (res.ok && data?.success) {
        showNotification(`Successfully uploaded ${data.assets?.length || filesArray.length} asset(s)!`, 'success');
        fetchAssets();
      } else {
        showNotification(data?.error || 'Upload failed', 'error');
      }
    } catch (err) {
      console.error("Upload failed:", err);
      showNotification('Network error uploading files', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAsset = async (asset) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${asset.originalName || asset.filename}"?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/media/${asset.id || asset._id}`, {
        method: 'DELETE'
      });
      const data = await safeReadJson(res);
      if (res.ok && data?.success) {
        showNotification(`Asset deleted successfully`, 'success');
        setAssets(prev => prev.filter(a => (a.id || a._id) !== (asset.id || asset._id)));
      } else {
        showNotification(data?.error || 'Failed to delete asset', 'error');
      }
    } catch (err) {
      console.error("Delete failed:", err);
      showNotification('Network error deleting asset', 'error');
    }
  };

  const copyToClipboard = async (text, idKey) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(idKey);
      showNotification('Copied to clipboard!', 'success');
      setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
      showNotification('Failed to copy text', 'error');
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  // Metric computations
  const totalFiles = assets.length;
  const imageCount = assets.filter(a => a.resourceType === 'image').length;
  const pdfCount = assets.filter(a => a.resourceType === 'pdf').length;
  const rawCount = assets.filter(a => a.resourceType === 'raw').length;
  const totalSizeBytes = assets.reduce((acc, a) => acc + (a.fileSize || 0), 0);
  const totalSizeFormatted = totalSizeBytes > 1024 * 1024 
    ? `${(totalSizeBytes / (1024 * 1024)).toFixed(1)} MB` 
    : `${(totalSizeBytes / 1024).toFixed(1)} KB`;

  const getFullProxyUrl = (proxyPath) => {
    if (!proxyPath) return '';
    if (proxyPath.startsWith('http')) return proxyPath;
    return `${window.location.origin}${proxyPath.startsWith('/') ? '' : '/'}${proxyPath}`;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '40px' }}>
      
      {/* Toast Notification Banner */}
      {notification && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          backgroundColor: notification.type === 'error' ? '#fef2f2' : '#f0fdf4',
          color: notification.type === 'error' ? '#991b1b' : '#166534',
          border: `1px solid ${notification.type === 'error' ? '#fca5a5' : '#bbf7d0'}`,
          borderRadius: '6px',
          padding: '12px 18px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '9pt',
          fontWeight: '600',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          {notification.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Top Card */}
      <div className="cf-card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '15pt', color: '#002147', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FolderArchive size={20} style={{ color: '#3b5998' }} /> BICS Media Drive
            </h2>
            <div style={{ fontSize: '8.5pt', color: '#64748b' }}>
              Upload diagrams, PDFs, and raw files to generate high-speed proxy and CDN links for test questions, MCQ options, and notices.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '8pt', backgroundColor: '#e2e8f0', color: '#334155', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold' }}>
              {totalFiles} Asset{totalFiles === 1 ? '' : 's'} ({totalSizeFormatted})
            </span>
            <button 
              className="cf-btn-secondary" 
              onClick={fetchAssets} 
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} className={loading ? 'spin-smooth' : ''} />
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Drag and Drop Zone */}
        <div 
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          style={{
            border: isDragging ? '2px dashed #2563eb' : '2px dashed #94a3b8',
            backgroundColor: isDragging ? '#eff6ff' : '#f8fafc',
            borderRadius: '6px',
            padding: '30px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '15px'
          }}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => handleUploadFiles(e.target.files)} 
            multiple 
            style={{ display: 'none' }} 
            accept="image/*,application/pdf,.pdf,.txt,.csv,.json,.zip"
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <UploadCloud size={32} style={{ color: isDragging ? '#2563eb' : '#64748b' }} />
            <div style={{ fontSize: '10pt', fontWeight: '600', color: '#002147' }}>
              {uploading ? 'Uploading to BICS Media Drive...' : 'Drag & drop files here, or click to browse'}
            </div>
            <div style={{ fontSize: '8pt', color: '#64748b' }}>
              Supports Images (PNG, JPG, SVG, WebP, GIF), PDFs, CSV, JSON, and ZIP (Max 25 MB per file).
            </div>
            <div style={{ fontSize: '7.5pt', color: '#0284c7', backgroundColor: '#e0f2fe', padding: '2px 8px', borderRadius: '3px', marginTop: '4px' }}>
              💡 Pro-Tip: You can also press <strong>Ctrl + V</strong> anywhere on this page to upload screenshots directly from your clipboard!
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          
          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { id: 'all', label: `All (${totalFiles})` },
              { id: 'image', label: `Images (${imageCount})` },
              { id: 'pdf', label: `PDFs (${pdfCount})` },
              { id: 'raw', label: `Raw / Docs (${rawCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '4px 12px',
                  fontSize: '8.5pt',
                  fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                  backgroundColor: activeTab === tab.id ? '#3b5998' : '#f1f5f9',
                  color: activeTab === tab.id ? '#ffffff' : '#334155',
                  border: '1px solid',
                  borderColor: activeTab === tab.id ? '#3b5998' : '#cbd5e1',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input 
              type="text" 
              className="cf-input" 
              placeholder="Search assets by filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '30px', fontSize: '8.5pt', width: '100%', boxSizing: 'border-box' }}
            />
          </div>

        </div>
      </div>

      {/* Asset Grid & Gallery */}
      <div className="cf-card">
        <div className="cf-card-title">
          <span>Uploaded Media Files</span>
        </div>

        {assets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '9pt' }}>
            <HardDrive size={36} style={{ color: '#cbd5e1', marginBottom: '10px' }} />
            <div>No media assets found matching the selected filter.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
              <thead>
                <tr>
                  <th style={{ width: '60px', textAlign: 'center' }}>Preview</th>
                  <th>Filename &amp; Info</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Uploaded At</th>
                  <th style={{ width: '320px', textAlign: 'center' }}>Quick Copy Actions</th>
                  <th style={{ width: '50px', textAlign: 'center' }}>Delete</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const isImage = asset.resourceType === 'image';
                  const isPdf = asset.resourceType === 'pdf';
                  const assetId = asset.id || asset._id;
                  const formattedSize = asset.fileSize > 1024 * 1024
                    ? `${(asset.fileSize / (1024 * 1024)).toFixed(1)} MB`
                    : `${(asset.fileSize / 1024).toFixed(1)} KB`;
                  const formattedDate = new Date(asset.createdAt).toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  });
                  const fullProxy = getFullProxyUrl(asset.proxyUrl);
                  const markdownImg = isImage ? `![${asset.originalName || asset.filename}](${fullProxy})` : null;
                  const markdownDoc = `[${asset.originalName || asset.filename}](${fullProxy})`;

                  return (
                    <tr key={assetId}>
                      {/* Thumbnail Preview */}
                      <td style={{ textAlign: 'center', padding: '8px' }}>
                        {isImage ? (
                          <div 
                            onClick={() => setPreviewModalAsset(asset)}
                            style={{ 
                              width: '40px', 
                              height: '40px', 
                              borderRadius: '4px', 
                              border: '1px solid #cbd5e1', 
                              overflow: 'hidden', 
                              backgroundColor: '#ffffff', 
                              margin: '0 auto', 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <img 
                              src={asset.cdnUrl || asset.proxyUrl} 
                              alt="thumb" 
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                            />
                          </div>
                        ) : isPdf ? (
                          <div style={{ width: '40px', height: '40px', borderRadius: '4px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                            <FileText size={20} style={{ color: '#dc2626' }} />
                          </div>
                        ) : (
                          <div style={{ width: '40px', height: '40px', borderRadius: '4px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                            <File size={20} style={{ color: '#64748b' }} />
                          </div>
                        )}
                      </td>

                      {/* Filename & Info */}
                      <td>
                        <div style={{ fontWeight: '600', color: '#002147', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{asset.originalName || asset.filename}</span>
                          <a 
                            href={fullProxy || asset.cdnUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ color: '#0284c7', display: 'inline-flex', alignItems: 'center' }}
                            title="Open in new tab"
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                        <div style={{ fontSize: '7.5pt', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>
                          {asset.filename}
                        </div>
                      </td>

                      {/* Category Badge */}
                      <td>
                        <span style={{
                          fontSize: '7.5pt',
                          padding: '2px 8px',
                          borderRadius: '3px',
                          fontWeight: 'bold',
                          backgroundColor: isImage ? '#e0f2fe' : (isPdf ? '#fee2e2' : '#f1f5f9'),
                          color: isImage ? '#0369a1' : (isPdf ? '#b91c1c' : '#334155'),
                          border: `1px solid ${isImage ? '#bae6fd' : (isPdf ? '#fecaca' : '#cbd5e1')}`
                        }}>
                          {asset.resourceType?.toUpperCase() || 'FILE'}
                        </span>
                      </td>

                      {/* File Size */}
                      <td style={{ color: '#475569', fontSize: '8pt', whiteSpace: 'nowrap' }}>
                        {formattedSize}
                      </td>

                      {/* Uploaded At */}
                      <td style={{ color: '#64748b', fontSize: '8pt', whiteSpace: 'nowrap' }}>
                        {formattedDate}
                      </td>

                      {/* Quick Action Copy Buttons */}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                          
                          {/* Copy Proxy URL */}
                          <button
                            className="cf-btn-secondary"
                            onClick={() => copyToClipboard(fullProxy, `${assetId}_proxy`)}
                            title="Copy Portal Proxy URL"
                            style={{ padding: '3px 8px', fontSize: '7.5pt', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            {copiedId === `${assetId}_proxy` ? <Check size={11} style={{ color: '#16a34a' }} /> : <Copy size={11} />}
                            <span>Proxy URL</span>
                          </button>

                          {/* Copy Markdown Image (if image) */}
                          {isImage && (
                            <button
                              className="cf-btn-primary"
                              onClick={() => copyToClipboard(markdownImg, `${assetId}_mdimg`)}
                              title="Copy Markdown Image tag: ![alt](url)"
                              style={{ padding: '3px 8px', fontSize: '7.5pt', display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#0284c7', borderColor: '#0284c7' }}
                            >
                              {copiedId === `${assetId}_mdimg` ? <Check size={11} /> : <ImageIcon size={11} />}
                              <span>MD Image</span>
                            </button>
                          )}

                          {/* Copy Markdown Link */}
                          <button
                            className="cf-btn-secondary"
                            onClick={() => copyToClipboard(markdownDoc, `${assetId}_mdlink`)}
                            title="Copy Markdown Document Link: [name](url)"
                            style={{ padding: '3px 8px', fontSize: '7.5pt', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            {copiedId === `${assetId}_mdlink` ? <Check size={11} style={{ color: '#16a34a' }} /> : <FileText size={11} />}
                            <span>MD Link</span>
                          </button>

                        </div>
                      </td>

                      {/* Delete Button */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteAsset(asset)}
                          title="Delete asset"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Image Zoom Preview Modal */}
      {previewModalAsset && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }} onClick={() => setPreviewModalAsset(null)}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '6px',
              padding: '20px',
              maxWidth: '800px',
              maxHeight: '90vh',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '10pt', color: '#002147' }}>
                {previewModalAsset.originalName || previewModalAsset.filename}
              </div>
              <button 
                onClick={() => setPreviewModalAsset(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', padding: '10px 0' }}>
              <img 
                src={previewModalAsset.cdnUrl || previewModalAsset.proxyUrl} 
                alt="preview" 
                style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '4px' }} 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
              <div style={{ fontSize: '8pt', color: '#64748b' }}>
                Proxy Path: <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '3px' }}>{previewModalAsset.proxyUrl}</code>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="cf-btn-primary"
                  onClick={() => copyToClipboard(`![${previewModalAsset.originalName}](${getFullProxyUrl(previewModalAsset.proxyUrl)})`, 'modal_md')}
                  style={{ fontSize: '8pt' }}
                >
                  Copy Markdown Tag
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
