import React, { useEffect, useRef, useState } from 'react';
import { Navigation } from 'lucide-react';
import { openCurrentLocationDirections } from '../lib/directions.js';

export default function WalkingDirectionsLink({link, children, className = 'btn primary walking-link'}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const request = useRef(null);

  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, []);

  function cancelRequest() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
  }

  async function openDirections() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setResult(null);
    try {
      const route = await openCurrentLocationDirections(link, {signal: controller.signal});
      if (!controller.signal.aborted && !route.opened) setResult({forLink: link, url: route.url});
    } catch (error) {
      if (!controller.signal.aborted) setResult({forLink: link, error: error.message});
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  if (!link) return null;
  const current = result?.forLink === link ? result : null;
  return <div className="walking-directions-control">
    {current?.url ? <>
      <a className={className} href={current.url} target="_blank" rel="noopener noreferrer"><Navigation size={17}/>Open walking directions in Google Maps ↗</a>
      <p className="address-message" role="status">Your route is ready. Select the button above to open it from your detected location.</p>
      <button type="button" className="btn secondary" onClick={openDirections} disabled={busy}>Refresh my starting location</button>
    </> : <button type="button" className={className} onClick={openDirections} disabled={busy} aria-busy={busy}>
      <Navigation size={17}/>{busy ? 'Finding your current location…' : children || 'Get walking directions in Google Maps ↗'}
    </button>}
    {busy && <div className="address-message" role="status">
      <p>Allow location access in this HeatSafe tab. This takes up to 12 seconds.</p>
      <button type="button" className="btn secondary" onClick={cancelRequest}>Cancel location lookup</button>
    </div>}
    {current?.error && <p className="address-message" role="alert">{current.error}</p>}

  </div>;
}
