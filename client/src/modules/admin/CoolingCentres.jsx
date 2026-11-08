import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Search, Plus, LocateFixed, ArrowLeft, MapPin, Clock3, Phone, Users, Wrench, CheckCircle2, BadgeCheck } from 'lucide-react';
import CentreAddressVerifier from '../../components/CentreAddressVerifier.jsx';
import CentreLocationMap from '../../components/CentreLocationMap.jsx';
import CentrePhotoEditor from '../../components/CentrePhotoEditor.jsx';
import CentreGallery from '../../components/CentreGallery.jsx';
import { centrePhotos } from '../../lib/centrePhotos.js';
import { isPublishedCentre } from '../../lib/centreVisibility.js';
import { Field, Empty } from '../../components/Shared.jsx';
import { api, asset, status } from '../../lib/api.js';

const EMPTY_CENTRE = { name: '', address: '', latitude: '3.1390', longitude: '101.6869', operatingHours: '', contact: '', description: '', facilities: '', capacity: '', status: 'open' };

function DetailRow({ icon: Icon, label, children }) {
  return <div className="centre-detail-row"><span className="centre-detail-icon"><Icon size={16} /></span><div><small>{label}</small><div>{children || 'Not provided'}</div></div></div>;
}

export default function CoolingCentres({ page, userCoords, locate, weatherError, isAdmin, attention = 0, centres = [], loaded = true, refresh, setError, setSuccess, setPage }) {
  const [search, setSearch] = useState('');
  const [centreEdit, setCentreEdit] = useState(null);
  const [selectedId, setSelectedId] = useState(() => location.hash.match(/^#\/centres\/(\d+)$/)?.[1] || null);
  const [photos, setPhotos] = useState([]), [cropping, setCropping] = useState(false), [saving, setSaving] = useState(false);
  const [cf, setCf] = useState({ ...EMPTY_CENTRE });
  const [matchedLocation, setMatchedLocation] = useState(null), [addressConfirmed, confirmAddress] = useState(false), [verifying, setVerifying] = useState(false);
  const unchangedLocation = Boolean(centreEdit && cf.address.trim() === (centreEdit.address||'').trim() && Math.abs(Number(cf.latitude)-Number(centreEdit.latitude)) < .0000005 && Math.abs(Number(cf.longitude)-Number(centreEdit.longitude)) < .0000005);
  const locationReady = unchangedLocation || Boolean(matchedLocation && addressConfirmed);
  useEffect(() => { const sync = () => setSelectedId(location.hash.match(/^#\/centres\/(\d+)$/)?.[1] || null); window.addEventListener('hashchange',sync); return () => window.removeEventListener('hashchange',sync); }, []);
  const selectedCentre = centres.find(c => String(c.id) === String(selectedId) && (isAdmin || isPublishedCentre(c)));
  function openCentre(centre) {
    if (!location.hash.startsWith('#/centres')) history.replaceState(null,'',location.pathname+location.search+'#/centres');
    location.hash='/centres/'+centre.id;
    setSelectedId(String(centre.id));
    window.scrollTo({top:0,behavior:'instant'});
  }
  function closeDetails() { history.replaceState(null,'',location.pathname+location.search+'#/centres'); setSelectedId(null); window.scrollTo({top:0,behavior:'instant'}); }

  const filteredCentres = useMemo(
    () => centres.filter(c => isPublishedCentre(c) && `${c.name} ${c.address}`.toLowerCase().includes(search.toLowerCase())),
    [centres, search]
  );
  const setCentreField = (key, value) => setCf(previous => ({ ...previous, [key]: value }));

  function editCentre(centre) {
    closeDetails();
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
    setPhotos(centrePhotos(centre).map(url=>({id:url,kind:'existing',savedUrl:url,url:asset(url)})));
    setCropping(false); setMatchedLocation(null); confirmAddress(false); setVerifying(false);
    setPage('centreform');
  }

  async function saveCentre(event) {
    event.preventDefault();
    const formData = new FormData();
    Object.entries(cf).forEach(([key, value]) => formData.append(key, String(value)));
    if (cropping || saving || verifying) return;
    if (!locationReady) { setError('Verify and confirm the centre address before saving.'); return; }
    if (matchedLocation) formData.append('locationToken',matchedLocation.locationToken);
    formData.append('addressConfirmed',String(addressConfirmed));
    let newIndex = 0;
    const order = photos.map(photo => { if (photo.kind === 'existing') return 'existing:' + photo.savedUrl; formData.append('images',photo.file); return 'new:' + newIndex++; });
    formData.append('photoOrder',JSON.stringify(order));
    setSaving(true);
    try {
      const saved = await api(centreEdit ? `/admin/centres/${centreEdit.id}` : '/admin/centres', {
        method: centreEdit ? 'PUT' : 'POST',
        body: formData
      });
      setSuccess(saved.verified ? 'Cooling centre and photo gallery saved.' : 'Centre saved. Review it in Verification before it appears in Cooling Centres.');
      closeDetails();
      setPage(saved.verified ? 'centres' : 'verification');
      await refresh();
    } catch (error) {
      setError(error.message);
    } finally { setSaving(false); }
  }

  async function delCentre(centre) {
    if (!window.confirm(`Delete ${centre.name}?`)) return;
    try {
      await api(`/admin/centres/${centre.id}`, { method: 'DELETE' });
      setSuccess('Centre deleted.');
      if (String(selectedCentre?.id) === String(centre.id)) closeDetails();
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
            <p>Enter the full address, select a matching map location, and confirm the centre entrance before saving.</p>
          </div>
        </header>

        <CentreAddressVerifier form={cf} matched={matchedLocation} confirmed={addressConfirmed} unchanged={unchangedLocation} onBusy={setVerifying} onConfirm={confirmAddress} onAddress={address=>{setCf(previous=>({...previous,address,latitude:'',longitude:''}));setMatchedLocation(null);confirmAddress(false);}} onMatch={result=>{setCf(previous=>({...previous,address:result.address,latitude:String(result.latitude),longitude:String(result.longitude)}));setMatchedLocation(result);confirmAddress(false);}}/>

        <form className="formgrid" onSubmit={saveCentre}>
          {[
            ['name', 'Centre name *'],
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

          <div className="span2"><CentrePhotoEditor value={photos} onChange={setPhotos} onBusyChange={setCropping}/></div>

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
            <button type="submit" className="btn primary" disabled={saving || cropping || verifying || !locationReady}>{saving ? 'Saving gallery…' : cropping ? 'Finish cropping photos first' : !locationReady ? 'Verify and confirm address first' : centreEdit ? 'Save changes' : 'Add centre'}</button>
          </div>
        </form>
      </section>
    );
  }

  if (selectedId && page !== 'centreform') {
    if (!loaded) return <div className="panel" role="status">Loading cooling centre…</div>;
    if (!selectedCentre) return <section className="panel"><button className="btn secondary" onClick={closeDetails}><ArrowLeft size={15}/>Back to cooling centres</button><Empty title="Centre unavailable" text="This centre may have been removed or is not currently published."/></section>;
    return <section className="centre-details-page"><div className="centre-details-toolbar"><button className="btn secondary" onClick={closeDetails}><ArrowLeft size={15}/>Back to cooling centres</button>{isAdmin&&<div><button className="btn secondary" onClick={()=>setPage('verification')}>Verification</button><button className="btn primary" onClick={()=>editCentre(selectedCentre)}>Edit centre</button><button className="btn danger-outline" onClick={()=>delCentre(selectedCentre)}>Delete centre</button></div>}</div><header className="centre-details-title"><small className="eyebrow">COOLING CENTRE DETAILS</small><h2>{selectedCentre.name}</h2><div className="centre-modal-badges"><span className={'pill '+selectedCentre.status}>{status(selectedCentre.status)}</span>{selectedCentre.verified?<span className="centre-verified"><CheckCircle2 size={14}/>Verified facility</span>:<span className="pill pending">Verification: {status(selectedCentre.effective_status||'pending')}</span>}</div></header><div className="centre-details-layout"><CentreGallery key={selectedCentre.id} photos={centrePhotos(selectedCentre)} name={selectedCentre.name}/><section className="panel centre-details-info"><h3>About this cooling centre</h3><div className="centre-detail-grid"><DetailRow icon={MapPin} label="Address">{selectedCentre.address}</DetailRow><DetailRow icon={Clock3} label="Operating hours">{selectedCentre.operating_hours}</DetailRow><DetailRow icon={Phone} label="Contact">{selectedCentre.contact}</DetailRow><DetailRow icon={Users} label="Capacity">{selectedCentre.capacity??'Not provided'}</DetailRow><DetailRow icon={MapPin} label="Coordinates">{`${selectedCentre.latitude}, ${selectedCentre.longitude}`}</DetailRow>{isAdmin&&<><DetailRow icon={CheckCircle2} label="Last inspection">{selectedCentre.last_inspection_date}</DetailRow><DetailRow icon={Clock3} label="Next inspection due">{selectedCentre.next_inspection_date}</DetailRow></>}<DetailRow icon={Wrench} label="Facilities">{selectedCentre.facilities?.join(', ')}</DetailRow></div><div className="centre-detail-description"><small>Description</small><p>{selectedCentre.description||'No description provided.'}</p></div></section></div><CentreLocationMap centre={selectedCentre}/></section>;
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
        <small>{filteredCentres.length} locations</small>
      </div>


      <div className="centre-tiles">{filteredCentres.map(centre=><button type="button" className="centre-tile" key={centre.id} onClick={()=>openCentre(centre)}><div className="centre-tile-photo">{centrePhotos(centre)[0]?<img src={asset(centrePhotos(centre)[0])} alt="" loading="lazy"/>:<Building2 size={40}/>}</div><h3>{centre.name}</h3></button>)}</div>

      {!filteredCentres.length && <Empty title="No cooling centres listed" text={isAdmin ? 'Only verified centres appear here. Manage pending, rejected or expired centres in Verification.' : 'No verified cooling-centre locations have been published. Check official local guidance for current assistance.'} />}

    </>
  );
}
