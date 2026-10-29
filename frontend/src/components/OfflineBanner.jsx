import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

const PING_INTERVAL = 30000;

export default function OfflineBanner({ onBackendStatusChange }) {
  const [offline, setOffline] = useState(false);

  const checkHealth = useCallback(async () => {
    try {
      await axios.get('/api/health', { timeout: 5000 });
      if (offline) {
        setOffline(false);
        onBackendStatusChange?.(true);
      }
    } catch {
      if (!offline) {
        setOffline(true);
        onBackendStatusChange?.(false);
      }
    }
  }, [offline, onBackendStatusChange]);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, PING_INTERVAL);
    return () => clearInterval(interval);
  }, [checkHealth]);

  if (!offline) return null;

  return (
    <div className="bg-[var(--ff-warning-soft)] border-b border-[var(--ff-warning)]/20 px-4 py-2 text-center">
      <p className="text-xs font-medium text-[var(--ff-warning)]">
        Backend unreachable — switched to Ollama (local). Some features may be limited.
      </p>
    </div>
  );
}
