import React, { useState } from 'react';
import { Upload, MapPin, FileText, Eye } from 'lucide-react';
import { api, asset, dt, status } from '../lib/api.js';

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Photo({ label = 'Photo', file, onChange }) {
  return (
    <label className="upload">
      <Upload size={18} />
      <span>
        <b>{label}</b>
        <small>JPG, PNG or WebP · max 5 MB</small>
        <small>{file?.name || 'Choose image'}</small>
      </span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={e => onChange(e.target.files?.[0] || null)}
      />
    </label>
  );
}

export function Metric({ icon: Icon, label, value, note, color }) {
  return (
    <div className="metric">
      <div className={'metricicon ' + color}>
        <Icon size={19} />
      </div>
      <div>
        <small>{label}</small>
        <b>{value}</b>
        <span>{note}</span>
      </div>
    </div>
  );
}

export function Panel({ title, sub, action, click, children }) {
  return (
    <section className="panel">
      <header className="panelhead">
        <div>
          <h3>{title}</h3>
          <p>{sub}</p>
        </div>
        {action && (
          <button className="textlink" onClick={click}>
            {action} ↗
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

export function Empty({ title, text }) {
  return (
    <div className="empty">
      <MapPin size={25} />
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

export function ReportTable({ rows, onSelect }) {
  return rows.length ? (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Report</th>
            <th>Submitted by</th>
            <th>Location</th>
            <th>Date</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>
                <div className="reportname">
                  {r.image_url ? (
                    <img src={asset(r.image_url)} alt="Report evidence" />
                  ) : (
                    <FileText />
                  )}
                  <span>
                    <b>{r.title}</b>
                    <small>{r.category}</small>
                  </span>
                </div>
              </td>
              <td>{r.reporter_name || 'You'}</td>
              <td>{r.location_text}</td>
              <td>{dt(r.created_at)}</td>
              <td>
                <span className={'pill ' + r.status}>
                  {status(r.status)}
                </span>
              </td>
              <td>
                <button
                  className="iconbtn"
                  onClick={() => onSelect(r)}
                  aria-label="View report"
                >
                  <Eye size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="No reports found"
      text="Reports will appear after a registered user submits one."
    />
  );
}

export function ReportCard({ r }) {
  return (
    <article className="reportcard">
      <div className="reporttop">
        <span className={'pill ' + r.status}>{status(r.status)}</span>
        <small>{dt(r.created_at)}</small>
      </div>

      <h3>{r.title}</h3>
      <span className="tag">{r.category}</span>
      <p>{r.description}</p>
      <p>⌖ {r.location_text}</p>

      {r.image_url && (
        <img
          className="reportimg"
          src={asset(r.image_url)}
          alt="Report evidence"
        />
      )}

      {r.review_note && (
        <div className="reviewnote">
          <b>Administrator note</b>
          <p>{r.review_note}</p>
        </div>
      )}

      {r.review_image_url && (
        <div className="evidence">
          <b>Review photo</b>
          <img src={asset(r.review_image_url)} alt="Review evidence" />
        </div>
      )}
    </article>
  );
}

export function PasswordPanel() {
  const [f, F] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [msg, M] = useState('');
  const [msgType, MT] = useState('');
  const [busy, B] = useState(false);

  function updateField(name, value) {
    F(previous => ({ ...previous, [name]: value }));
    M('');
    MT('');
  }

  async function submit(e) {
    e.preventDefault();
    M('');
    MT('');

    if (f.newPassword !== f.confirmPassword) {
      M('New password and confirm password do not match.');
      MT('error');
      return;
    }

    if (f.newPassword.length < 8) {
      M('New password must contain at least 8 characters.');
      MT('error');
      return;
    }

    B(true);
    try {
      const result = await api('/account/password', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: f.currentPassword,
          newPassword: f.newPassword,
        }),
      });

      M(result.message || 'Password updated successfully.');
      MT('success');
      F({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (e) {
      M(e.message || 'Unable to update password. Please check your current password and try again.');
      MT('error');
    } finally {
      B(false);
    }
  }

  return (
    <Panel title="Account security" sub="Update your password">
      <form className="stack" onSubmit={submit}>
        <Field label="Current password">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={f.currentPassword}
            onChange={e => updateField('currentPassword', e.target.value)}
          />
        </Field>

        <Field label="New password (8+ characters)">
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={f.newPassword}
            onChange={e => updateField('newPassword', e.target.value)}
          />
        </Field>

        <Field label="Confirm new password">
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={f.confirmPassword}
            onChange={e => updateField('confirmPassword', e.target.value)}
            aria-invalid={Boolean(f.confirmPassword) && f.newPassword !== f.confirmPassword}
          />
        </Field>

        {msg && (
          <small
            role={msgType === 'error' ? 'alert' : 'status'}
            style={{
              display: 'block',
              color: msgType === 'error' ? '#b42318' : '#16803c',
              marginTop: '2px',
            }}
          >
            {msg}
          </small>
        )}

        <button className="btn secondary" type="submit" disabled={busy}>
          {busy ? 'Updating password…' : 'Update password'}
        </button>
      </form>
    </Panel>
  );
}