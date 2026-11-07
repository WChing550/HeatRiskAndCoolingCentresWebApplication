import React, { useState, useEffect, useRef } from 'react';
import { LocateFixed, ImagePlus, X } from 'lucide-react';
import { api } from '../../lib/api.js';

const EMPTY_REPORT = { title: '', category: 'Heat exposure', description: '', location: '', latitude: '', longitude: '' };
const CATEGORIES = [
  'Heat exposure',
  'Unsafe outdoor condition',
  'Cooling centre issue',
  'New cooling centre found',
  'Heat-related incident',
  'Other',
];
const MAX_PHOTOS = 5;

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    return data.display_name || '';
  } catch {
    return '';
  }
}

function MapPreview({ latitude, longitude }) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const d = 0.004;
  const bbox = [lon - d, lat - d, lon + d, lat + d].join('%2C');
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`;
  return (
    <iframe
      title="Selected location"
      src={src}
      style={{ width: '100%', height: 240, border: 0, borderRadius: 12 }}
      loading="lazy"
    />
  );
}

function PhotoDropzone({ label, files, onChange, max = MAX_PHOTOS }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(list) {
    const images = Array.from(list).filter(f => f.type.startsWith('image/'));
    onChange([...files, ...images].slice(0, max));
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6 }}>{label}</label>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#2563eb' : '#9ca3af'}`,
          background: dragging ? 'rgba(37,99,235,0.06)' : 'transparent',
          borderRadius: 12,
          padding: 20,
          textAlign: 'center',
          cursor: 'pointer',
        }}
      >
        <ImagePlus size={22} />
        <p style={{ margin: '6px 0 0' }}>
          Drag & drop images here, or click to browse ({files.length}/{max})
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {previews.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
          {previews.map((src, i) => (
            <div key={src} style={{ position: 'relative' }}>
              <img src={src} alt={`Upload ${i + 1}`} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 22, height: 22,
                  borderRadius: '50%', border: 0, background: '#111', color: '#fff',
                  display: 'grid', placeItems: 'center', cursor: 'pointer',
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SubmitReport({ ctx }) {
  const { user, locate, refresh, setPage, E: setError, S: setSuccess, Field } = ctx;
  const [form, setForm] = useState({ ...EMPTY_REPORT });
  const [photos, setPhotos] = useState([]);
  const [locating, setLocating] = useState(false);
  const setField = (key, value) => setForm(previous => ({ ...previous, [key]: value }));

  const hasCoords = form.latitude !== '' && form.longitude !== '';

  function locateForReport() {
    setLocating(true);
    locate(async (coords) => {
      const lat = String(coords.latitude);
      const lon = String(coords.longitude);
      setForm(previous => ({ ...previous, latitude: lat, longitude: lon }));
      const address = await reverseGeocode(lat, lon);
      setForm(previous => ({
        ...previous,
        location: address || previous.location || 'My current location',
      }));
      setLocating(false);
    });
  }

  async function submitReport(event) {
    event.preventDefault();
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => formData.append(key, value));
    photos.forEach(file => formData.append('images', file));
    try {
      await api('/reports', { method: 'POST', body: formData });
      setSuccess('Report submitted for review.');
      setForm({ ...EMPTY_REPORT });
      setPhotos([]);
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
            {CATEGORIES.map(item => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Location / address *">
          <input required value={form.location} onChange={e => setField('location', e.target.value)} placeholder="Street, landmark or neighbourhood" />
        </Field>
        <div className="locatebtn">
          <button type="button" className="btn secondary" onClick={locateForReport} disabled={locating}>
            <LocateFixed size={15} /> {locating ? 'Locating…' : 'Use my location'}
          </button>
        </div>
        {hasCoords && (
          <div className="span2">
            <MapPreview latitude={form.latitude} longitude={form.longitude} />
          </div>
        )}
        <div className="span2"><Field label="Description *"><textarea required rows="4" value={form.description} onChange={e => setField('description', e.target.value)} placeholder="What happened, when and what safety concern did you observe?" /></Field></div>
        <div className="span2"><PhotoDropzone label="Supporting photos (optional)" files={photos} onChange={setPhotos} /></div>
        <div className="actions span2">
          <button type="button" className="btn secondary" onClick={() => setPage('myreports')}>Cancel</button>
          <button className="btn primary">Submit for review ↗</button>
        </div>
      </form>
    </section>
  );
}