import React, {useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import {MapContainer, TileLayer, Marker, useMapEvents} from 'react-leaflet';
import {MapPin, CheckCircle2} from 'lucide-react';
import {api} from '../lib/api.js';
import {walkingDirections} from '../lib/directions.js';
import WalkingDirectionsLink from './WalkingDirectionsLink.jsx';

const pinIcon=L.divIcon({className:'centre-entrance-pin',html:'<span style="display:block;width:24px;height:24px;background:#536e86;border:4px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #536e86"></span>',iconSize:[32,32],iconAnchor:[16,16]});

function PickPoint({onPick}) {
  useMapEvents({click:event=>onPick(event.latlng.lat,event.latlng.lng)});
  return null;
}

export default function CentrePinEditor({match,onConfirmed,onBusyChange}) {
  const original=[Number(match.latitude),Number(match.longitude)];
  const [position,setPosition]=useState(original);
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const request=useRef(null);
  const changed=Math.abs(position[0]-original[0])>.0000005||Math.abs(position[1]-original[1])>.0000005;
  useEffect(()=>{onBusyChange(changed||saving);},[changed,saving,onBusyChange]);
  useEffect(()=>()=>{request.current?.abort();onBusyChange(false);},[onBusyChange]);
  function pick(lat,lon) {
    if(saving)return;
    if(lat<3||lat>3.3||lon<101.55||lon>101.8){setError('Choose an entrance inside Kuala Lumpur.');return;}
    setError('');setPosition([Number(lat.toFixed(6)),Number(lon.toFixed(6))]);
  }
  async function confirmPin() {
    if(request.current)return;
    const controller=new AbortController();request.current=controller;setSaving(true);setError('');
    try {
      const result=await api('/admin/centre-locations/confirm-pin',{method:'POST',signal:controller.signal,body:JSON.stringify({locationToken:match.locationToken,address:match.address,latitude:position[0],longitude:position[1]})});
      if(!controller.signal.aborted)onConfirmed(result);
    }catch(e){if(!controller.signal.aborted)setError(e.message);}
    finally{request.current=null;if(!controller.signal.aborted)setSaving(false);}
  }
  return <section className="panel centre-location-detail">
    <header className="panelhead"><div><h3><MapPin size={18}/>Check the walking entrance</h3><p>Click the map or drag the pin onto the actual entrance. A station or neighbouring building may have a different entrance.</p></div></header>
    <div className="centre-detail-map" aria-label="Choose cooling centre entrance">
      <MapContainer center={original} zoom={18} scrollWheelZoom={false} style={{height:330,width:'100%'}}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
        <PickPoint onPick={pick}/>
        <Marker position={position} icon={pinIcon} draggable={!saving} eventHandlers={{dragend:event=>{const point=event.target.getLatLng();pick(point.lat,point.lng);}}}/>
      </MapContainer>
    </div>
    <p className="address-message">Entrance: {position[0].toFixed(6)}, {position[1].toFixed(6)}</p>
    {changed?<div className="actions"><button type="button" className="btn primary" disabled={saving} onClick={confirmPin}><CheckCircle2 size={16}/>{saving?'Confirming entrance…':'Confirm this entrance pin'}</button><button type="button" className="btn secondary" disabled={saving} onClick={()=>{setPosition(original);setError('');}}>Reset pin</button></div>:<p className="address-message">Move the pin if the address match points to the wrong building. Otherwise, confirm the address below.</p>}
    {error&&<p className="address-message" role="alert">{error}</p>}
    {!changed&&!saving&&<WalkingDirectionsLink link={walkingDirections(match)} className="btn secondary">Preview walking route to this entrance ↗</WalkingDirectionsLink>}
  </section>;
}
