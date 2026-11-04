import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import { Building2, Search, Plus, LocateFixed, Eye, X, MapPin, Clock3, Phone, Users, Wrench, CheckCircle2, BadgeCheck } from 'lucide-react';
import LocationSearchMap from '../../components/LocationSearchMap.jsx';
import { Field, Photo, Empty } from '../../components/Shared.jsx';
import { api, asset, status } from '../../lib/api.js';

const EMPTY_CENTRE = { name: '', address: '', latitude: '3.1390', longitude: '101.6869', operatingHours: '', contact: '', description: '', facilities: '', capacity: '', status: 'open' };

function DetailRow({ icon: Icon, label, children }) {
  return <div className="centre-detail-row"><span className="centre-detail-icon"><Icon size={16} /></span><div><small>{label}</small><div>{children || 'Not provided'}</div></div></div>;
}

export default function CoolingCentres({ page, userCoords, locate, weatherError, isAdmin, attention = 0, centres = [], refresh, setError, setSuccess, setPage }) {
  const [search, setSearch] = useState('');
  const [centreEdit, setCentreEdit] = useState(null);
  const [selectedCentre, setSelectedCentre] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [cf, setCf] = useState({ ...EMPTY_CENTRE });

  useEffect(() => {
    if (!photo) {
      setPhotoPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!selectedCentre) return undefined;
    const current = centres.find(c => String(c.id) === String(selectedCentre.id));
    if (current) setSelectedCentre(current);
    return undefined;
  }, [centres]);

  const filteredCentres = useMemo(
    () => centres.filter(c => (isAdmin || c.verified) && `${c.name} ${c.address}`.toLowerCase().includes(search.toLowerCase())),
    [centres, isAdmin, search]
  );
  const setCentreField = (key, value) => setCf(previous => ({ ...previous, [key]: value }));

  function editCentre(centre) {
    setCentreEdit(centre || null);
    setCf(centre ? {
      name: centre.name || '',
      address: centre.address || '',
      latitude: centre.latitude ?? '',
      longitude: centre.longitude ?? '',
      operatingHours: centre.operating_hours || '',
      contact: centre.contact || '',
      description: centre.description || '',
      facilities: (centre.facilities || []).join(', '),
      capacity: centre.capacity ?? '',
      status: centre.status || 'open'
    } : { ...EMPTY_CENTRE });
    setPhoto(null);
    setPage('centreform');
  }

  async function saveCentre(event) {
    event.preventDefault();
    const formData = new FormData();
    Object.entries(cf).forEach(([key, value]) => formData.append(key, String(value)));
    if (photo) formData.append('image', photo);
    try {
      await api(centreEdit ? `/admin/centres/${centreEdit.id}` : '/admin/centres', {
        method: centreEdit ? 'PUT' : 'POST',
        body: formData
      });
      setSuccess('Cooling centre saved.');
      setPage('centres');
      await refresh();
    } catch (error) {
      setError(error.message);
    }
  }

  async function delCentre(centre) {
    if (!window.confirm(`Delete ${centre.name}?`)) return;
    try {
      await api(`/admin/centres/${centre.id}`, { method: 'DELETE' });
      setSuccess('Centre deleted.');
      if (String(selectedCentre?.id) === String(centre.id)) setSelectedCentre(null);
      await refresh();
    } catch (error) {
      setError(error.message);
    }
  }

  if (page === 'centreform' && isAdmin) {
    return (
      <section className="panel">
        <header className="panelhead">
          <div>
            <h3>{centreEdit ? 'Edit cooling centre' : 'Add cooling centre'}</h3>
            <p>Search for a place or address, then confirm the pin and facility details.</p>
          </div>
        </header>

        <LocationSearchMap
          latitude={cf.latitude}
          longitude={cf.longitude}
          address={cf.address}
          onSelect={({ latitude, longitude, address }) => {
            setCentreField('latitude', String(latitude));
            setCentreField('longitude', String(longitude));
            if (address) setCentreField('address', address);
          }}
        />

        <form className="formgrid" onSubmit={saveCentre}>
          {[
            ['name', 'Centre name *'],
            ['address', 'Full address *'],
            ['latitude', 'Latitude *'],
            ['longitude', 'Longitude *'],
            ['operatingHours', 'Operating hours *'],
            ['contact', 'Contact'],
            ['capacity', 'Capacity'],
            ['facilities', 'Facilities (comma-separated)'],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                value={cf[key] ?? ''}
                type={['latitude', 'longitude', 'capacity'].includes(key) ? 'number' : 'text'}
                step={['latitude', 'longitude'].includes(key) ? 'any' : undefined}
                onChange={e => setCentreField(key, e.target.value)}
                required={label.includes('*')}
              />
            </Field>
          ))}

          <Field label="Operational status">
            <select value={cf.status} onChange={e => setCentreField('status', e.target.value)}>
              <option value="open">Open</option>
              <option value="temporarily_closed">Temporarily closed</option>
              <option value="maintenance">Under maintenance</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </Field>

          <Field label="Description">
            <textarea rows="3" value={cf.description ?? ''} onChange={e => setCentreField('description', e.target.value)} />
          </Field>

          <div className="span2">
            <Photo label={centreEdit?.image_url ? 'Change cooling centre photo (optional)' : 'Cooling centre photo'} file={photo} onChange={setPhoto} />
            {(photoPreview || (!photo && centreEdit?.image_url)) && (
              <div className="centre-upload-preview">
                <img src={photoPreview || asset(centreEdit.image_url)} alt="Cooling centre preview" />
                <div>
                  <b>{photo ? 'New photo preview' : 'Current saved photo'}</b>
                  <small>{photo ? photo.name : 'Choose a new image above to replace this photo.'}</small>
                </div>
              </div>
            )}
            {centreEdit?.image_url && photo && (
              <small className="muted">The new photo will replace the current photo after you save changes.</small>
            )}
          </div>

          <div className="check span2">
            <span>
              <b>Verification: {centreEdit ? status(centreEdit.effective_status || 'pending') : 'Pending'}</b>
              <small>
                {centreEdit
                  ? 'Verification is managed in Centre Verification, where each inspection is recorded with remarks, evidence and a next inspection date.'
                  : 'New centres are saved as Pending and are not shown to the public until an inspection is recorded in Centre Verification.'}
              </small>
            </span>
            {centreEdit && <button type="button" className="btn secondary" onClick={() => setPage('verification')}>Open verification</button>}
          </div>

          <div className="actions span2">
            <button type="button" className="btn secondary" onClick={() => setPage('centres')}>Cancel</button>
            <button type="submit" className="btn primary">{centreEdit ? 'Save changes' : 'Add centre'}</button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search centre or address…" />
        </div>
        {isAdmin && <button type="button" className="btn primary" onClick={() => editCentre(null)}><Plus size={16} /> Add centre</button>}
        {isAdmin && <button type="button" className="btn secondary" onClick={() => setPage('verification')}><BadgeCheck size={16} /> Verification{attention > 0 && <span className="btn-badge">{attention}</span>}</button>}
        {!isAdmin && <button type="button" className="btn secondary" onClick={locate}><LocateFixed size={16} /> Locate me</button>}
        <small>{filteredCentres.length} locations</small>
      </div>

      {!isAdmin && weatherError && <div className="notice">{weatherError}</div>}

      {(filteredCentres.length > 0 || !isAdmin) && (
        <div className="map">
          <MapContainer
            key={userCoords ? `${userCoords.latitude},${userCoords.longitude}` : 'kl-default'}
            center={userCoords ? [userCoords.latitude, userCoords.longitude] : [3.139, 101.6869]}
            zoom={userCoords ? 14 : 12}
            scrollWheelZoom
            style={{ height: 360, width: '100%' }}
          >
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {filteredCentres.map(centre => (
              <Marker key={centre.id} position={[Number(centre.latitude), Number(centre.longitude)]}>
                <Popup>
                  <b>{centre.name}</b><br />
                  {centre.address}<br />
                  {status(centre.status)}<br />
                  {centre.operating_hours || 'Hours not provided'}
                  {isAdmin && <><br /><button type="button" onClick={() => setSelectedCentre(centre)}>View details</button></>}
                </Popup>
              </Marker>
            ))}
            {userCoords && <CircleMarker center={[userCoords.latitude, userCoords.longitude]} radius={9} pathOptions={{ color: '#e8752e', fillColor: '#e8752e', fillOpacity: 0.9 }}><Popup><b>Your current location</b></Popup></CircleMarker>}
          </MapContainer>
        </div>
      )}

      <div className="cards">
        {filteredCentres.map(centre => (
          <article className="centre" key={centre.id}>
            <div className="centrephoto">
              {centre.image_url ? <img src={asset(centre.image_url)} alt={centre.name} onError={e => { e.currentTarget.style.display = 'none'; }} /> : <Building2 size={35} />}
              <span className={`pill ${centre.status}`}>{status(centre.status)}</span>
              {centre.verified ? <label>✓ Verified</label> : isAdmin && <label className={centre.effective_status === 'expired' ? 'centre-expired' : 'centre-unverified'}>{status(centre.effective_status || 'pending')}</label>}
            </div>
            <div className="centrebody">
              <small>{centre.area || 'KUALA LUMPUR'}</small>
              <h3>{centre.name}</h3>
              <p>⌖ {centre.address}</p>
              <p>◷ {centre.operating_hours || 'Hours not provided'}</p>
              {centre.contact && <p>☎ {centre.contact}</p>}
              {centre.description && <p>{centre.description}</p>}
              {centre.facilities?.length > 0 && <div className="tags">{centre.facilities.map(item => <span key={item}>{item}</span>)}</div>}
              <div className="centrefoot">
                {centre.capacity ? `Capacity ${centre.capacity}` : 'Capacity not provided'}
                <span className="centre-actions">
                  {isAdmin && <button type="button" onClick={() => setSelectedCentre(centre)}><Eye size={14} /> Details</button>}
                  {isAdmin && <button type="button" onClick={() => editCentre(centre)}>Edit</button>}
                  {isAdmin && <button type="button" className="danger" onClick={() => delCentre(centre)}>Delete</button>}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>

      {!filteredCentres.length && <Empty title="No cooling centres listed" text={isAdmin ? 'Add a real Kuala Lumpur facility and verify its details before publishing.' : 'No verified cooling-centre locations have been published. Check official local guidance for current assistance.'} />}

      {isAdmin && selectedCentre && (
        <div className="centre-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedCentre(null); }}>
          <section className="centre-modal" role="dialog" aria-modal="true" aria-labelledby="centre-detail-title">
            <header className="centre-modal-head">
              <div><small>COOLING CENTRE DETAILS</small><h2 id="centre-detail-title">{selectedCentre.name}</h2></div>
              <button type="button" className="iconbtn" aria-label="Close details" onClick={() => setSelectedCentre(null)}><X size={18} /></button>
            </header>
            {selectedCentre.image_url && <img className="centre-modal-photo" src={asset(selectedCentre.image_url)} alt={selectedCentre.name} />}
            <div className="centre-modal-content">
              <div className="centre-modal-badges"><span className={`pill ${selectedCentre.status}`}>{status(selectedCentre.status)}</span>{selectedCentre.verified ? <span className="centre-verified"><CheckCircle2 size={14} /> Verified facility</span> : <span className={'pill ' + (selectedCentre.effective_status || 'pending')}>Verification: {status(selectedCentre.effective_status || 'pending')}</span>}</div>
              <div className="centre-detail-grid">
                <DetailRow icon={MapPin} label="Address">{selectedCentre.address}</DetailRow>
                <DetailRow icon={Clock3} label="Operating hours">{selectedCentre.operating_hours}</DetailRow>
                <DetailRow icon={Phone} label="Contact">{selectedCentre.contact}</DetailRow>
                <DetailRow icon={Users} label="Capacity">{selectedCentre.capacity == null ? 'Not provided' : selectedCentre.capacity}</DetailRow>
                <DetailRow icon={MapPin} label="Coordinates">{`${selectedCentre.latitude}, ${selectedCentre.longitude}`}</DetailRow>
                <DetailRow icon={CheckCircle2} label="Last inspection">{selectedCentre.last_inspection_date}</DetailRow>
                <DetailRow icon={Clock3} label="Next inspection due">{selectedCentre.next_inspection_date}</DetailRow>
                <DetailRow icon={Wrench} label="Facilities">{(selectedCentre.facilities || []).length ? selectedCentre.facilities.join(', ') : 'Not provided'}</DetailRow>
              </div>
              <div className="centre-detail-description"><small>Description</small><p>{selectedCentre.description || 'No description provided.'}</p></div>
              <div className="centre-modal-actions">
                <button type="button" className="btn secondary" onClick={() => setSelectedCentre(null)}>Close</button>
                <button type="button" className="btn secondary" onClick={() => { setSelectedCentre(null); setPage('verification'); }}>Verification</button>
                <button type="button" className="btn primary" onClick={() => { const centre = selectedCentre; setSelectedCentre(null); editCentre(centre); }}>Edit centre</button>
              </div>
            </div>
          </section>
        </div>
      )}

      <style>{`
        .centre-upload-preview{display:flex;align-items:center;gap:14px;margin-top:12px;padding:12px;border:1px solid #eee;border-radius:10px;background:#fff}
        .centre-upload-preview img{width:112px;height:82px;object-fit:cover;border-radius:7px;background:#f6f6f6}
        .centre-upload-preview div{display:grid;gap:5px;min-width:0}.centre-upload-preview b{font-size:12px}.centre-upload-preview small{font-size:11px;color:#777;overflow-wrap:anywhere}
        .centre-actions{display:flex;flex-wrap:wrap;align-items:center;gap:7px}.centre-actions button{display:inline-flex;align-items:center;gap:5px}
        .centre-modal-backdrop{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(20,25,30,.55);overflow-y:auto}
        .centre-modal{width:min(680px,100%);max-height:min(90vh,900px);overflow-y:auto;background:#fff;border:1px solid #eee;border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.2);color:#292929}
        .centre-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:22px 24px;border-bottom:1px solid #eee}.centre-modal-head small{font-size:10px;letter-spacing:1px;color:#e8752e;font-weight:800}.centre-modal-head h2{font-size:22px;line-height:1.3;margin:7px 0 0}.centre-modal-photo{display:block;width:100%;max-height:280px;object-fit:cover;background:#f6f6f6}
        .centre-modal-content{padding:22px 24px}.centre-modal-badges{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:20px}.centre-verified{display:inline-flex;align-items:center;gap:5px;color:#278052;font-size:11px;font-weight:700}
        .centre-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 24px}.centre-detail-row{display:flex;align-items:flex-start;gap:10px;min-width:0;font-size:12px;overflow-wrap:anywhere}.centre-detail-icon{display:grid;place-items:center;width:32px;height:32px;flex:0 0 32px;border-radius:9px;background:#fff0e5;color:#e8752e}.centre-detail-row small,.centre-detail-description small{display:block;margin-bottom:5px;color:#777;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}.centre-detail-row div div{line-height:1.6;color:#333}.centre-detail-description{margin-top:22px;padding:15px;background:#fafafa;border:1px solid #eee;border-radius:10px}.centre-detail-description p{margin:0;font-size:12px;line-height:1.7;white-space:pre-wrap}.centre-modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}
        @media(max-width:600px){.centre-detail-grid{grid-template-columns:1fr}.centre-modal-backdrop{padding:10px}.centre-modal-head,.centre-modal-content{padding:18px}.centre-modal-head h2{font-size:19px}.centre-upload-preview img{width:84px;height:72px}}
      `}</style>
    </>
  );
}
