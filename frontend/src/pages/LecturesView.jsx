import React from 'react';
import { Video } from 'lucide-react';

export default function LecturesView({
  videoLectures = [],
  selectedLecture,
  setSelectedLecture,
  getYouTubeEmbedUrl
}) {
  return (
    <div className="cf-card">
      <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Video size={18} style={{ color: '#3b5998' }} />
        <span>Course Video Lectures</span>
      </div>
      {videoLectures.length === 0 ? (
        <div className="cf-alert cf-alert-info">No video lectures uploaded yet.</div>
      ) : (
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '15px' }}>
          
          {/* Lecture Player Viewport */}
          <div style={{ flex: '2 1 600px', minWidth: '300px' }}>
            {selectedLecture ? (
              <div>
                <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#000' }}>
                  <iframe
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                    src={getYouTubeEmbedUrl && getYouTubeEmbedUrl(selectedLecture.youtubeUrl)}
                    title={selectedLecture.title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  ></iframe>
                </div>
                <h3 style={{ marginTop: '15px', color: '#002147', fontSize: '14pt', fontWeight: 'bold' }}>
                  {selectedLecture.title}
                </h3>
                <span className="status-badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', display: 'inline-block', marginTop: '5px' }}>
                  {selectedLecture.section}
                </span>
              </div>
            ) : (
              <div className="cf-alert cf-alert-info">Select a lecture from the side list to begin playing.</div>
            )}
          </div>

          {/* Lecture Navigation Side List */}
          <div style={{ flex: '1 1 280px', minWidth: '240px', borderLeft: '1px solid #e2e8f0', paddingLeft: '20px', maxHeight: '550px', overflowY: 'auto' }}>
            <h4 style={{ color: '#333', fontWeight: 'bold', marginBottom: '12px', paddingBottom: '5px', borderBottom: '2px solid #3b5998' }}>
              Lecture Sections
            </h4>
            {Array.from(new Set(videoLectures.map(l => l.section))).map((section, sIdx) => (
              <div key={sIdx} style={{ marginBottom: '20px' }}>
                <h5 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10pt', marginBottom: '8px', textTransform: 'uppercase' }}>
                  {section}
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {videoLectures.filter(l => l.section === section).map((lect, lIdx) => (
                    <button
                      key={lIdx}
                      onClick={() => setSelectedLecture && setSelectedLecture(lect)}
                      className="cf-btn-secondary"
                      style={{
                        textAlign: 'left',
                        fontSize: '9pt',
                        padding: '8px 10px',
                        width: '100%',
                        border: selectedLecture && (selectedLecture.id === lect.id || selectedLecture._id === lect._id)
                          ? '2px solid #3b5998'
                          : '1px solid #e2e8f0',
                        backgroundColor: selectedLecture && (selectedLecture.id === lect.id || selectedLecture._id === lect._id)
                          ? '#f1f5f9'
                          : '#fff',
                        fontWeight: selectedLecture && (selectedLecture.id === lect.id || selectedLecture._id === lect._id)
                          ? 'bold'
                          : 'normal'
                      }}
                    >
                      {lect.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
