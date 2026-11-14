import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Building2, Search, LocateFixed, ArrowLeft, MapPin, Clock3, Phone, Wrench, CheckCircle2 } from 'lucide-react';
import CentreLocationMap from '../../components/CentreLocationMap.jsx';
import CoolingCentresDirectoryMap from '../../components/CoolingCentresDirectoryMap.jsx';
import CentreGallery from '../../components/CentreGallery.jsx';
import { centrePhotos } from '../../lib/centrePhotos.js';
import { isPublishedCentre } from '../../lib/centreVisibility.js';
import { Empty } from '../../components/Shared.jsx';
import { asset, status } from '../../lib/api.js';

// Haversine formula to calculate straight-line distance in kilometers
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="centre-detail-row">
      <span className="centre-detail-icon"><Icon size={16} /></span>
      <div>
        <small>{label}</small>
        <div>{children || 'Not provided'}</div>
      </div>
    </div>
  );
}

function CentreTile({ centre, onOpen, distance }) {
  const tile = useRef(null);
  const address = useRef(null);

  useLayoutEffect(() => {
    if (!tile.current || !address.current) return;

    const measure = () => {
      if (!tile.current || !address.current) return;
      const height = Math.ceil(address.current.getBoundingClientRect().height);
      tile.current.style.setProperty('--centre-address-height', `${height}px`);
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(address.current);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [centre.address]);

  const cover = centrePhotos(centre)[0];

  return (
    <button
      ref={tile}
      type="button"
      className="centre-tile centre-tile--reveal"
      onClick={() => onOpen(centre)}
      aria-label={`${centre.name}. Address: ${centre.address}`}
    >
      <div className="centre-tile-photo">
        {cover ? <img src={asset(cover)} alt="" loading="lazy" /> : <Building2 size={40} />}
        {distance != null && (
          <span className="centre-distance">
            {distance.toFixed(1)} km
          </span>
        )}
      </div>
      <div className="centre-tile-caption">
        <h3>{centre.name}</h3>
        <div ref={address} className="centre-tile-address">
          <span className="centre-tile-location-icon" aria-hidden="true">
            <MapPin size={18} />
          </span>
          <div className="centre-tile-address-copy">
            <p>{centre.address}</p>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function UserCoolingCentres({
  page, userCoords, locate, locationError, centres = [], loaded = true,
}) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(() =>
    location.hash.match(/^#\/centres\/(\d+)$/)?.[1] || null
  );

  useEffect(() => {
    const sync = () => setSelectedId(location.hash.match(/^#\/centres\/(\d+)$/)?.[1] || null);
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const selectedCentre = centres.find(centre =>
    String(centre.id) === String(selectedId) && isPublishedCentre(centre)
  );

  function openCentre(centre) {
    if (!location.hash.startsWith('#/centres')) {
      history.replaceState(null, '', location.pathname + location.search + '#/centres');
    }
    location.hash = '/centres/' + centre.id;
    setSelectedId(String(centre.id));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function closeDetails() {
    history.replaceState(null, '', location.pathname + location.search + '#/centres');
    setSelectedId(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  const filteredCentres = useMemo(() => centres
    .filter(centre => isPublishedCentre(centre) &&
      `${centre.name} ${centre.address}`.toLowerCase().includes(search.toLowerCase()))
    .map(centre => {
      const coordinates = [userCoords?.latitude, userCoords?.longitude, centre.latitude, centre.longitude];
      const hasCoordinates = coordinates.every(value =>
        value != null && String(value).trim() !== '' && Number.isFinite(Number(value)));
      return {
        ...centre,
        distance: hasCoordinates ? getDistanceKm(...coordinates.map(Number)) : null,
      };
    })
    .sort((a, b) => a.distance != null && b.distance != null ? a.distance - b.distance : 0),
  [centres, search, userCoords]);

  if (page !== 'centres') return null;

  if (selectedId) {
    if (!loaded) return <div className="panel" role="status">Loading cooling centre…</div>;
    if (!selectedCentre) return (
      <section className="panel user-centres-page">
        <button type="button" className="btn secondary" onClick={closeDetails}>
          <ArrowLeft size={15} />Back to cooling centres
        </button>
        <Empty title="Centre unavailable" text="This centre may have been removed or is not currently published." />
      </section>
    );
    return (
      <section className="centre-details-page user-centres-page">
        <div className="centre-details-toolbar">
          <button type="button" className="btn secondary" onClick={closeDetails}>
            <ArrowLeft size={15} />Back to cooling centres
          </button>
        </div>
        <header className="centre-details-title">
          <small className="eyebrow">COOLING CENTRE DETAILS</small>
          <h2>{selectedCentre.name}</h2>
          <div className="centre-modal-badges">
            <span className={'pill ' + selectedCentre.status}>{status(selectedCentre.status)}</span>
            <span className="centre-verified"><CheckCircle2 size={14} />Verified facility</span>
          </div>
        </header>
        <div className="centre-details-layout">
          <CentreGallery key={selectedCentre.id} photos={centrePhotos(selectedCentre)} name={selectedCentre.name} />
          <section className="panel centre-details-info">
            <h3>About this cooling centre</h3>
            <div className="centre-detail-grid">
              <DetailRow icon={MapPin} label="Address">{selectedCentre.address}</DetailRow>
              <DetailRow icon={Clock3} label="Operating hours">{selectedCentre.operating_hours}</DetailRow>
              <DetailRow icon={Phone} label="Contact">{selectedCentre.contact}</DetailRow>
              <DetailRow icon={Wrench} label="Facilities">{selectedCentre.facilities?.join(', ')}</DetailRow>
            </div>
            <div className="centre-detail-description">
              <small>Description</small>
              <p>{selectedCentre.description || 'No description provided.'}</p>
            </div>
          </section>
        </div>
        <CentreLocationMap centre={selectedCentre} />
      </section>
    );
  }

  return (
    <div className="user-centres-page">
      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search centre or address…" />
        </div>
        <button type="button" className={`btn ${userCoords ? 'primary' : 'secondary'}`} onClick={() => locate?.()}>
          <LocateFixed size={16} />{userCoords ? 'Sorted by nearest' : 'Locate me'}
        </button>
        <small>{filteredCentres.length} locations</small>
      </div>
      {locationError && <div className="notice" role="alert">{locationError}</div>}
      <CoolingCentresDirectoryMap centres={filteredCentres} location={userCoords} onOpen={openCentre} />
      <div className="centre-tiles">
        {filteredCentres.map(centre => (
          <CentreTile key={centre.id} centre={centre} distance={centre.distance} onOpen={openCentre} />
        ))}
      </div>
      {!filteredCentres.length && (
        <Empty title="No cooling centres listed" text="No verified cooling-centre locations have been published. Check official local guidance for current assistance." />
      )}
    </div>
  );
}
