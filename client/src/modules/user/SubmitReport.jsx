import React, { useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { api } from '../../lib/api.js';

const EMPTY_REPORT = { title: '', category: 'Heat exposure', description: '', location: '', latitude: '', longitude: '' };

export default function SubmitReport({ ctx }) {
  const { user, locate, refresh, setPage, E: setError, S: setSuccess, Field, Photo, setReportPhoto: _unused } = ctx;
  const [form, setForm] = useState({ ...EMPTY_REPORT });
  const [reportPhoto, setReportPhoto] = useState(null);
  const setField = (key, value) => setForm(previous => ({ ...previous, [key]: value }));

  function locateForReport() {
    locate((coords) => {
      setForm(previous => ({
        ...previous,
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
        location: previous.location || 'My current location',
      }));
    });
  }

  async function submitReport(event) {
    event.preventDefault();
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => formData.append(key, value));
    if (reportPhoto) formData.append('image', reportPhoto);
    try {
      await api('/reports', { method: 'POST', body: formData });
      setSuccess('Report submitted for review.');
      setForm({ ...EMPTY_REPORT });
      setReportPhoto(null);
      setPage('myreports');
      await refresh();
    } catch (error) {
      setError(error.message);
    }
  }

  if (!user) return null;

  return (
    <section className="panel">
      <header className="panelhead">
        <div>
          <h3>Submit a community report</h3>
          <p>Provide clear details and optional photo evidence. Reports must relate to Kuala Lumpur.</p>
        </div>
      </header>
      <form className="formgrid" onSubmit={submitReport}>
        <Field label="Report title *">
          <input required value={form.title} onChange={e => setField('title', e.target.value)} placeholder="e.g. Unshaded pedestrian area" />
        </Field>
        <Field label="Category *">
          <select value={form.category} onChange={e => setField('category', e.target.value)}>
            {['Heat exposure', 'Unsafe outdoor condition', 'Cooling centre issue', 'Heat-related incident', 'Other'].map(item => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Location / address *">
          <input required value={form.location} onChange={e => setField('location', e.target.value)} placeholder="Street, landmark or neighbourhood" />
        </Field>
        <div className="locatebtn">
          <button type="button" className="btn secondary" onClick={locateForReport}><LocateFixed size={15} /> Use my location</button>
        </div>
        <Field label="Latitude (optional)"><input type="number" step="any" value={form.latitude} onChange={e => setField('latitude', e.target.value)} /></Field>
        <Field label="Longitude (optional)"><input type="number" step="any" value={form.longitude} onChange={e => setField('longitude', e.target.value)} /></Field>
        <div className="span2"><Field label="Description *"><textarea required rows="4" value={form.description} onChange={e => setField('description', e.target.value)} placeholder="What happened, when and what safety concern did you observe?" /></Field></div>
        <div className="span2"><Photo label="Supporting photo (optional)" file={reportPhoto} onChange={setReportPhoto} /></div>
        <div className="actions span2">
          <button type="button" className="btn secondary" onClick={() => setPage('myreports')}>Cancel</button>
          <button className="btn primary">Submit for review ↗</button>
        </div>
      </form>
    </section>
  );
}
