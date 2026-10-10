import React from 'react';
import { formatMediaUrl } from '../../utils/media';

export default function AdminCoursework({
  systemConfig,
  adminMessage,
  adminError,
  courseworkSuccess,
  courseworkError,
  handleAddLecture,
  newLecture,
  setNewLecture,
  videoLectures,
  handleDeleteLecture,
  handleAddMaterial,
  newMaterial,
  setNewMaterial,
  setMaterialFile,
  courseMaterials,
  handleDeleteMaterial
}) {
  return (
    <div>
      <h2 style={{ fontSize: '18pt', color: '#002147', marginBottom: '20px' }}>Coursework Content Manager</h2>
      {adminMessage && <div className="cf-alert cf-alert-success">{adminMessage}</div>}
      {adminError && <div className="cf-alert cf-alert-error">{adminError}</div>}

      {/* ADMIN - MANAGE COURSE VIDEO LECTURES */}
      <div className="cf-card">
        <div className="cf-card-title">Course Video Lectures Manager</div>
        {courseworkSuccess && <div className="cf-alert cf-alert-success">{courseworkSuccess}</div>}
        {courseworkError && <div className="cf-alert cf-alert-error">{courseworkError}</div>}
        
        {/* Add Lecture Form */}
        <form onSubmit={handleAddLecture} className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '25px', paddingBottom: '20px', borderBottom: '1px solid #cbd5e1' }}>
          <div className="cf-input-group">
            <label className="cf-label">Course Section Name</label>
            <input
              type="text"
              className="cf-input"
              required
              value={newLecture.section}
              onChange={e => setNewLecture({...newLecture, section: e.target.value})}
              placeholder="e.g. Programming with C++"
            />
          </div>
          <div className="cf-input-group">
            <label className="cf-label">Lecture Title</label>
            <input
              type="text"
              className="cf-input"
              required
              value={newLecture.title}
              onChange={e => setNewLecture({...newLecture, title: e.target.value})}
              placeholder="e.g. Lecture 1: Introduction"
            />
          </div>
          <div className="cf-input-group">
            <label className="cf-label">YouTube URL Link</label>
            <input
              type="text"
              className="cf-input"
              required
              value={newLecture.youtubeUrl}
              onChange={e => setNewLecture({...newLecture, youtubeUrl: e.target.value})}
              placeholder="e.g. https://www.youtube.com/watch?v=..."
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="cf-btn-primary" style={{ width: '100%' }}>Add Lecture</button>
          </div>
        </form>

        {/* Lectures List Table */}
        <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10.5pt', marginBottom: '10px' }}>Active Video Lectures ({videoLectures.length})</h4>
        {videoLectures.length === 0 ? (
          <div className="cf-alert cf-alert-info">No lectures added.</div>
        ) : (
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Lecture Title</th>
                  <th>YouTube Link</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {videoLectures.map((l, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 'bold' }}>{l.section}</td>
                    <td>{l.title}</td>
                    <td>
                      <a href={l.youtubeUrl} target="_blank" rel="noreferrer" style={{ fontSize: '8.5pt', color: '#3b5998', textDecoration: 'underline' }}>
                        View Link
                      </a>
                    </td>
                    <td>
                      <button
                        className="cf-btn-secondary"
                        style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '3px 8px', fontSize: '8pt', border: '1px solid #fca5a5' }}
                        onClick={() => handleDeleteLecture(l.id || l._id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADMIN - MANAGE COURSE MATERIALS */}
      <div className="cf-card">
        <div className="cf-card-title">Course Study Materials Manager</div>
        
        {/* Add Material Form */}
        <form onSubmit={handleAddMaterial} className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '25px', paddingBottom: '20px', borderBottom: '1px solid #cbd5e1' }}>
          <div className="cf-input-group">
            <label className="cf-label">Material Section (Select or Type Custom)</label>
            <input
              type="text"
              className="cf-input"
              required
              value={newMaterial.section}
              onChange={e => setNewMaterial({...newMaterial, section: e.target.value})}
              placeholder="e.g. Curriculum, Textbooks, Assignments..."
              list="material-sections-list"
            />
            <datalist id="material-sections-list">
              <option value="Curriculum" />
              <option value="Textbooks" />
              <option value="External" />
              <option value="Assignments" />
              <option value="Practicals" />
            </datalist>
          </div>
          <div className="cf-input-group">
            <label className="cf-label">Material Title</label>
            <input
              type="text"
              className="cf-input"
              required
              value={newMaterial.title}
              onChange={e => setNewMaterial({...newMaterial, title: e.target.value})}
              placeholder="e.g. BICS C++ Syllabus"
            />
          </div>
          <div className="cf-input-group">
            <label className="cf-label">Document File Upload</label>
            <input
              type="file"
              className="cf-input"
              required
              onChange={e => setMaterialFile(e.target.files[0])}
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="cf-btn-primary" style={{ width: '100%' }}>Upload &amp; Add Material</button>
          </div>
        </form>

        {/* Materials List Table */}
        <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10.5pt', marginBottom: '10px' }}>Active Course Materials ({courseMaterials.length})</h4>
        {courseMaterials.length === 0 ? (
          <div className="cf-alert cf-alert-info">No materials added.</div>
        ) : (
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Material Name</th>
                  <th>File/Link Path</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {courseMaterials.map((m, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 'bold' }}>{m.section}</td>
                    <td>{m.title}</td>
                    <td>
                      <a href={formatMediaUrl(m.fileUrl)} target="_blank" rel="noreferrer" style={{ fontSize: '8.5pt', color: '#3b5998', textDecoration: 'underline' }}>
                        View File
                      </a>
                    </td>
                    <td>
                      <button
                        className="cf-btn-secondary"
                        style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '3px 8px', fontSize: '8pt', border: '1px solid #fca5a5' }}
                        onClick={() => handleDeleteMaterial(m.id || m._id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
