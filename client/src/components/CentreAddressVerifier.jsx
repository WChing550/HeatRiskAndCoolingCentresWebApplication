import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, CheckCircle2, MapPin } from 'lucide-react';
import CentreLocationMap from './CentreLocationMap.jsx';
import CentrePinEditor from './CentrePinEditor.jsx';
import { api } from '../lib/api.js';

export default function CentreAddressVerifier({form,matched,confirmed,unchanged,onAddress,onMatch,onConfirm,onBusy}){
  const [results,R]=useState([]),[busy,B]=useState(false),[message,M]=useState('');const request=useRef(0);
  const [pinPending,setPinPending]=useState(false);
  useEffect(()=>{onBusy(busy||pinPending);},[busy,pinPending,onBusy]);
  const handlePinBusy=useCallback(pending=>{setPinPending(pending);if(pending)onConfirm(false);},[onConfirm]);
  useEffect(()=>{request.current++;R([]);M('');B(false);setPinPending(false);},[form.address,onBusy]);
  async function verify(){
    const id=++request.current;B(true);M('');R([]);
    try{const query=new URLSearchParams({q:form.address,venue:form.name||''});const data=await api('/admin/centre-locations/search?'+query);if(id!==request.current)return;R(data.matches||[]);M(data.matches?.length?'Choose the correct venue or street below, then check its entrance on the map. Your full address is kept.':'No matching venue or street was found in Kuala Lumpur. Enter the building name in Centre name below, then verify again. Map data may use a different street name.');}
    catch(e){if(id===request.current)M(e.message);}finally{if(id===request.current){B(false);setPinPending(false);}}
  }
  return <section className="address-verifier" aria-label="Confirm cooling centre address"><label className="field"><span>Cooling centre address *</span><textarea rows={3} value={form.address} onChange={e=>onAddress(e.target.value)} placeholder="Street number, street name, postcode, Kuala Lumpur" required/></label><p className="address-message">Search uses the address and the Centre name below. If the street is missing from the map, enter the building name too.</p><div className="address-search-actions"><button type="button" className="btn secondary" disabled={busy||pinPending||form.address.trim().length<5} onClick={verify}><Search size={15}/>{busy?'Checking address…':'Verify address'}</button>{matched&&<span className="address-matched"><CheckCircle2 size={15}/>Map location selected</span>}</div>{message&&<p className="address-message" role="status">{message}</p>}{results.length>0&&<div className="address-match-results" aria-label="Matching Kuala Lumpur addresses">{results.map(result=><button type="button" key={result.id} onClick={()=>{onMatch(result);R([]);M('');}}><MapPin size={17}/><span>{result.mapAddress||result.address}<small>{result.matchKind==='street'?'Street match — confirm the building entrance':'Venue match — check the entrance'}</small><small>{result.latitude.toFixed(6)}, {result.longitude.toFixed(6)}</small></span></button>)}</div>}
    {(matched||unchanged)&&<div className="address-coordinates"><span>Latitude <b>{Number(form.latitude).toFixed(6)}</b></span><span>Longitude <b>{Number(form.longitude).toFixed(6)}</b></span></div>}
    {matched?.mapAddress&&<p className="address-message">Map record: {matched.mapAddress}{matched.matchKind==='street'?'. This identifies the street; move the pin to the cooling centre entrance.':''}</p>}
    {matched&&<CentrePinEditor key={matched.locationToken} match={matched} onConfirmed={onMatch} onBusyChange={handlePinBusy}/>}
    {unchanged&&!matched&&<CentreLocationMap centre={{...form,name:form.name||'Selected cooling centre'}}/>}
    {matched&&!pinPending&&<label className="address-confirm"><input type="checkbox" checked={confirmed} onChange={e=>onConfirm(e.target.checked)}/><span>I checked that this address and the map destination identify the cooling centre entrance.</span></label>}
    {unchanged&&!matched&&<p className="address-message">To correct this saved entrance, click Verify address, select a match, then move and confirm the pin. Changing the address text alone does not move the saved destination.</p>}
    {!matched&&!unchanged&&<p className="address-message">Verify the address and select a matching location to generate the walking-directions link automatically. The link appears here and in the saved centre details. A map match does not replace the separate facility inspection.</p>}
    <p className="address-attribution">Address matches: Photon · © OpenStreetMap contributors. Check the building and entrance; map data can be incomplete.</p>
  </section>;
}
