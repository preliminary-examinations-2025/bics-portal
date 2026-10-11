import React from 'react';
import { Loader2 } from 'lucide-react';

export function LobbyLoadingView({ lobbyMessage }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
      <Loader2 className="spinner" size={48} />
      <span style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', marginTop: '20px' }}>
        {lobbyMessage}
      </span>
    </div>
  );
}

export default LobbyLoadingView;
