import React, { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';

export default function Motion({ children }) {
  const [paused, setPaused] = useState(() => {
    try { return localStorage.getItem('heatsafe-motion') === 'paused'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('motion-paused', paused);
    try { localStorage.setItem('heatsafe-motion', paused ? 'paused' : 'on'); } catch { /* Storage may be unavailable. */ }
  }, [paused]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('in-view'); observer.unobserve(entry.target); }
    }), { threshold: .08 });
    const watch = () => document.querySelectorAll('[data-reveal]:not(.in-view)').forEach(el => observer.observe(el));
    watch();
    const changes = new MutationObserver(watch);
    changes.observe(document.getElementById('root'), { childList: true, subtree: true });
    return () => { observer.disconnect(); changes.disconnect(); };
  }, []);
  return <>{children}<button className="motion-toggle" aria-pressed={paused} onClick={() => setPaused(!paused)} title={paused ? 'Resume animation' : 'Pause animation'}>{paused ? <Play size={13} /> : <Pause size={13} />}<span>{paused ? 'Motion off' : 'Motion on'}</span></button></>;
}
