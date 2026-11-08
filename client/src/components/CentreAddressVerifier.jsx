import React, { useEffect, useRef, useState } from 'react';
import { Search, CheckCircle2, MapPin } from 'lucide-react';
import CentreLocationMap from './CentreLocationMap.jsx';
import CentrePinEditor from './CentrePinEditor.jsx';
import { api } from '../lib/api.js';

export default function CentreAddressVerifier({form,matched,confirmed,unchanged,onAddress,onMatch,onConfirm,onBusy}){
  const [results,R]=useState([]),[busy,B]=useState(false),[message,M]=useState('');const request=useRef(0);
  const [pinPending,setPinPending]=useState(false);
  useEffect(()=>{onBusy(busy||pinPending);},[busy,pinPending,onBusy]);
  useEffect(()=>{if(pinPending)onConfirm(false);},[pinPending,onConfirm]);
  useEffect(()=>{request.current++;R([]);M('');B(false);setPinPending(false);},[form.address,onBusy]);
  async function verify(){
    const id=++request.current;B(true);M('');R([]);
    try{const data=await api('/admin/centre-locations/search?q='+encodeURIComponent(form.address));if(id!==request.current)return;R(data.matches||[]);M(data.matches?.length?'Select the exact matching location below, then check the address and entrance.':'No specific matching address was found in Kuala Lumpur. Add a street, building name or postcode and try again.');}
    catch(e){if(id===request.current)M(e.message);}finally{if(id===request.current){B(false);setPinPending(false);}}
  }
  return <section className="address-verifier" aria-label="Confirm cooling centre address"><label className="field"><span>Cooling centre address *</span><textarea rows={3} value={form.address} onChange={e=>onAddress(e.target.value)} placeholder="Street number, street name, postcode, Kuala Lumpur" required/></label><div className="address-search-actions"><button type="button" className="btn secondary" disabled={busy||pinPending||form.address.trim().length<5} onClick={verify}><Search size={15}/>{busy?'Checking address…':'Verify address'}</button>{matched&&<span className="address-matched"><CheckCircle2 size={15}/>Map match selected</span>}</div>{message&&<p className="address-message" role="status">{message}</p>}{results.length>0&&<div className="address-match-results" aria-label="Matching Kuala Lumpur addresses">{results.map(result=><button type="button" key={result.id} onClick={()=>{onMatch(result);R([]);M('');}}><MapPin size={17}/><span>{result.address}<small>{result.latitude.toFixed(6)}, {result.longitude.toFixed(6)}</small></span></button>)}</div>}
    {(matched||unchanged)&&<div className="address-coordinates"><span>Latitude <b>{Number(form.latitude).toFixed(6)}</b></span><span>Longitude <b>{Number(form.longitude).toFixed(6)}</b></span></div>}
    {matched&&<CentrePinEditor key={matched.locationToken} match={matched} onConfirmed={onMatch} onBusyChange={setPinPending}/>}
    {unchanged&&!matched&&<CentreLocationMap centre={{...form,name:form.name||'Selected cooling centre'}}/>}
    {matched&&!pinPending&&<label className="address-confirm"><input type="checkbox" checked={confirmed} onChange={e=>onConfirm(e.target.checked)}/><span>I checked that this address and the map destination identify the cooling centre entrance.</span></label>}
    {unchanged&&!matched&&<p className="address-message">To correct this saved entrance, click Verify address, select a match, then move and confirm the pin. Changing the address text alone does not move the saved destination.</p>}
    {!matched&&!unchanged&&<p className="address-message">Verify the address and select a matching location to generate the walking-directions link automatically. The link appears here and in the saved centre details. A map match does not replace the separate facility inspection.</p>}
    <p className="address-attribution">Address matches: Photon · © OpenStreetMap contributors. Check the building and entrance; map data can be incomplete.</p>
  </section>;
}
