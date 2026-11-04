import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { dt } from '../lib/api.js';

// Shown with every alert so users never mistake an administrator advisory for an official warning.
export const ALERT_DISCLAIMER = 'Advisory published by HeatSafe KL administrators. This is not an official government emergency warning — always follow instructions from official authorities.';

export function AlertCard({ alert, preview = false, statusLabel = '' }) {
  const Icon = alert.severity === 'High' ? AlertTriangle : Info;
  return (
    <article className={'alertcard ' + alert.severity} role={preview ? undefined : 'alert'}>
      <div className="alertcard-top">
        <span className={'pill ' + alert.severity}><Icon size={11} style={{ verticalAlign: '-2px' }} /> {alert.severity} risk</span>
        {statusLabel && <span className="pill draft">{statusLabel}</span>}
        {preview && <span className="pill draft">Preview</span>}
      </div>
      <h4>{alert.title || 'Alert title'}</h4>
      <div className="alertmeta">
        <span>⌖ {alert.affected_area || 'Kuala Lumpur'}</span>
        {alert.starts_at && <span>From {dt(alert.starts_at)}</span>}
        {alert.ends_at && <span>Until {dt(alert.ends_at)}</span>}
      </div>
      <p>{alert.description || 'Alert description will appear here.'}</p>
      <small className="alertnote">{ALERT_DISCLAIMER}</small>
    </article>
  );
}

// Public banner: only alerts that are published and currently inside their start/end window are passed in.
export default function AlertBanner({ alerts = [] }) {
  if (!alerts.length) return null;
  return <div className="alertbanner">{alerts.map(alert => <AlertCard key={alert.id} alert={alert} />)}</div>;
}
