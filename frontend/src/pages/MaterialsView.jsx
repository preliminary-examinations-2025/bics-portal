import React from 'react';
import { formatMediaUrl } from '../utils/media';

export default function MaterialsView({ courseMaterials = [] }) {
  const defaultOrder = ["Curriculum", "Textbooks", "External", "Assignments", "Practicals"];
  const allSections = Array.from(new Set(courseMaterials.map(m => m.section)));
  const sortedSections = allSections.sort((a, b) => {
    const idxA = defaultOrder.indexOf(a);
    const idxB = defaultOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="cf-card">
      <div className="cf-card-title">Course Study Materials</div>
      {courseMaterials.length === 0 ? (
        <div className="cf-alert cf-alert-info">No study materials uploaded yet.</div>
      ) : (
        <div style={{ marginTop: '15px' }}>
          {sortedSections.map((section, sIdx) => {
            const sectionMats = courseMaterials.filter(m => m.section === section);
            if (sectionMats.length === 0) return null;

            return (
              <div key={sIdx} style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', marginBottom: '10px', paddingBottom: '5px', borderBottom: '2px solid #3b5998', display: 'inline-block' }}>
                  {section}
                </h4>
                <table className="cf-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', width: '60%' }}>Material Name</th>
                      <th style={{ textAlign: 'left', width: '25%' }}>Date Uploaded</th>
                      <th style={{ textAlign: 'center', width: '15%' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionMats.map((mat, mIdx) => (
                      <tr key={mIdx}>
                        <td>
                          <strong>{mat.title}</strong>
                        </td>
                        <td style={{ color: '#555', fontSize: '9pt' }}>
                          {new Date(mat.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <a
                            href={formatMediaUrl(mat.fileUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="cf-btn-primary"
                            style={{ padding: '4px 10px', fontSize: '8pt', textDecoration: 'none', display: 'inline-block' }}
                          >
                            View/Download
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
