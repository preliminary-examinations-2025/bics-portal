import React, { useState } from 'react';
import { CheckCircle, Eye, Printer, Loader2 } from 'lucide-react';
import { API_BASE } from '../config';
import { formatMediaUrl } from '../utils/media';

export default function LedgerUploadForm({ type, studentProfile, fetchStudentProfile, user, fetchStudentSubmissions, setView }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      if (selected.size > 5 * 1024 * 1024) {
        setUploadError("File size exceeds 5MB limit.");
        setFile(null);
        return;
      }
      setFile(selected);
      setUploadError('');
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setUploadError("Please select a file first.");
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadSuccess('');

    const formData = new FormData();
    formData.append('ledgerFile', file);
    formData.append('type', type);

    try {
      const res = await fetch(`${API_BASE}/candidate/upload-ledger/${studentProfile.id || studentProfile._id}`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUploadSuccess("Signed ledger uploaded successfully!");
        setFile(null);
        fetchStudentProfile();
      } else {
        setUploadError(data.error || "Failed to upload file.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError("Network connection error. Failed to reach server.");
    } finally {
      setUploading(false);
    }
  };

  const currentLedgerUrl = type === 'mid' ? studentProfile?.midSemLedgerUrl : studentProfile?.endSemLedgerUrl;

  return (
    <div style={{ marginTop: '15px', backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', padding: '20px', borderRadius: '6px', textAlign: 'left' }}>
      <h4 style={{ fontSize: '10pt', fontWeight: 'bold', color: '#002147', marginBottom: '10px' }}>
        Upload Scanned Signed Coursework Ledger ({type === 'mid' ? 'Mid' : 'End'} Sem)
      </h4>

      {uploadError && <div className="cf-alert cf-alert-error" style={{ fontSize: '9pt', padding: '8px 12px', marginBottom: '15px' }}>{uploadError}</div>}
      {uploadSuccess && <div className="cf-alert cf-alert-success" style={{ fontSize: '9pt', padding: '8px 12px', marginBottom: '15px' }}>{uploadSuccess}</div>}

      {currentLedgerUrl ? (
        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontSize: '9pt', fontWeight: 'bold', marginBottom: '10px' }}>
            <CheckCircle size={16} /> Signed ledger is already uploaded.
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '15px' }}>
            <a 
              href={formatMediaUrl(currentLedgerUrl)} 
              target="_blank" 
              rel="noreferrer" 
              className="cf-btn-secondary" 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '8.5pt', textDecoration: 'none', color: '#002147', border: '1px solid #002147', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', backgroundColor: '#fff' }}
            >
              <Eye size={14} /> View Uploaded Document
            </a>
            <span style={{ fontSize: '8.5pt', color: '#64748b' }}>Or upload a new copy below to overwrite it.</span>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ fontSize: '9pt', color: '#475569', margin: 0, lineHeight: '1.5' }}>
            Get your coursework submissions ledger printed and signed by your course instructor, then snap a photo or scan it and upload it here (PNG, JPG, or PDF under 5MB).
          </p>
          <div>
            <button 
              type="button" 
              className="cf-btn-secondary" 
              onClick={() => {
                setView('submissions');
                fetchStudentSubmissions(studentProfile?.studentId || user?.studentId || user?.username || "STU1001");
              }} 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '8.5pt', color: '#3b5998', border: '1px solid #3b5998', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', backgroundColor: '#fff', cursor: 'pointer' }}
            >
              <Printer size={14} /> &larr; Go to Ledger to Print
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleUploadSubmit} style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
        <input 
          type="file" 
          onChange={handleFileChange} 
          accept="image/*,.pdf" 
          style={{ 
            fontSize: '9pt', 
            padding: '6px 10px', 
            border: '1px solid #cbd5e1', 
            borderRadius: '4px', 
            backgroundColor: '#fff',
            cursor: 'pointer',
            maxWidth: '280px'
          }} 
          required
          disabled={uploading}
        />

        <button 
          type="submit" 
          className="cf-btn-primary" 
          disabled={!file || uploading}
          style={{ fontSize: '9pt', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', cursor: !file || uploading ? 'not-allowed' : 'pointer' }}
        >
          {uploading ? (
            <>
              <Loader2 className="spinner" size={14} /> Uploading...
            </>
          ) : (
            'Upload & Verify'
          )}
        </button>
      </form>
    </div>
  );
}
