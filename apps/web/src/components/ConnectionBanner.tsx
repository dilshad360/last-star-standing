import React from 'react';

interface ConnectionBannerProps {
  connected: boolean;
  error?: string | null;
  onDismissError?: () => void;
}

export const ConnectionBanner: React.FC<ConnectionBannerProps> = ({
  connected,
  error,
  onDismissError,
}) => {
  return (
    <>
      {/* Reconnecting / Disconnected toast */}
      {!connected && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            background: 'rgba(244, 63, 94, 0.9)',
            backdropFilter: 'blur(10px)',
            color: '#fff',
            padding: '8px 24px',
            borderRadius: 6,
            fontWeight: 'bold',
            fontSize: 13,
            boxShadow: '0 0 20px rgba(244, 63, 94, 0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>RECONNECTING TO QUANTUM SERVER GRID...</span>
        </div>
      )}

      {/* Error alert modal */}
      {error && (
        <div
          style={{
            position: 'fixed',
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid #f43f5e',
            color: '#fca5a5',
            padding: '12px 20px',
            borderRadius: 6,
            fontSize: 13,
            boxShadow: '0 0 24px rgba(244, 63, 94, 0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <span>{error}</span>
          {onDismissError && (
            <button
              onClick={onDismissError}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </>
  );
};
