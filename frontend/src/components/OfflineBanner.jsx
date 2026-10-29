import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

const PING_INTERVAL = 30000;

export default function OfflineBanner({ onBackendStatusChange }) {
  const [offline, setOffline] = useState(false);
  // One interval for the component's lifetime: the status and the latest
  // callback live in refs, so neither restarts the poll when it changes.
  const offlineRef = useRef(false);
  const callbackRef = useRef(onBackendStatusChange);
  useEffect(() => {
    callbackRef.current = onBackendStatusChange;
  }, [onBackendStatusChange]);

  useEffect(() => {
    const update = (isOffline) => {
      if (offlineRef.current === isOffline) return;
      offlineRef.current = isOffline;
      setOffline(isOffline);
      callbackRef.current?.(!isOffline);
    };
    const checkHealth = async () => {
      try {
        await axios.get('/api/health', { timeout: 5000 });
        update(false);
      } catch {
        update(true);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, PING_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (!offline) return null;

  return (
    <div className="bg-[var(--ff-warning-soft)] border-b border-[var(--ff-warning)]/20 px-4 py-2 text-center">
      <p className="text-xs font-medium text-[var(--ff-warning)]">
        Backend unreachable — switched to Ollama (local). Some features may be limited.
      </p>
    </div>
  );
}
