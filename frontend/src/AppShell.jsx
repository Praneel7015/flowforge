import React, { useState, useCallback } from 'react';
import LandingPage from './pages/LandingPage';
import App from './App';

const VISITED_KEY = 'flowforge.hasVisited.v1';

function hasVisited() {
  try {
    return localStorage.getItem(VISITED_KEY) === 'true';
  } catch {
    return false;
  }
}

function markVisited() {
  try {
    localStorage.setItem(VISITED_KEY, 'true');
  } catch { /* ignore */ }
}

export default function AppShell() {
  const [showApp, setShowApp] = useState(() => hasVisited());

  const handleEnterApp = useCallback(() => {
    markVisited();
    setShowApp(true);
  }, []);

  const handleBackToLanding = useCallback(() => {
    setShowApp(false);
  }, []);

  if (!showApp) {
    return <LandingPage onEnterApp={handleEnterApp} />;
  }

  return <App onBackToLanding={handleBackToLanding} />;
}
