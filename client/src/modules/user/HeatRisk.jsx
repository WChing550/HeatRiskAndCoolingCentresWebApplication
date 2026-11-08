import React from 'react';
import { LocateFixed, RefreshCw, MapPin } from 'lucide-react';

export default function HeatRisk({ ctx }) {
  const { page, weather, weatherError, getWeather, locate, dt, Panel, isAdmin, weatherScope = 'city', setWeatherScope, userCoords, weatherLoading, locationError, refreshWeather } = ctx;
  if (page !== 'heat') return null;
  const risk = weather?.risk_level;
  const personal = weatherScope === 'location';
  return <>
    <div className="weather-scope"><div><MapPin size={17}/><span><b>{personal ? 'My current location' : 'Kuala Lumpur weather'}</b><small>{personal ? 'Weather near your detected coordinates. This does not replace city monitoring.' : 'City monitoring uses Kuala Lumpur coordinates, regardless of your device location.'}</small></span></div>{<div className="weather-scope-actions"><button className={'btn secondary '+(!personal?'scope-selected':'')} disabled={weatherLoading} onClick={()=>{setWeatherScope('city');(isAdmin ? refreshWeather : getWeather)();}}><RefreshCw size={14}/>Refresh Kuala Lumpur weather</button>{personal && userCoords && <button className="btn secondary" disabled={weatherLoading} onClick={()=>getWeather(userCoords)}><RefreshCw size={14}/>Refresh my location weather</button>}<button className="btn secondary" disabled={weatherLoading} onClick={()=>locate(()=>setWeatherScope('location'))}><LocateFixed size={14}/>{personal?'Detect my location again':'Use my current location'}</button></div>}</div>
    {weatherError && <div className="notice" role="alert">{weatherError}</div>}{locationError && locationError !== weatherError && <div className="notice" role="alert">{locationError}</div>}
    <div className={isAdmin?'admin-heat-reading':'columns heatcols'}>
      <div className={'heatbox '+(risk==='High'?'high':risk==='Moderate'?'moderate':risk==='Low'?'low':'unavailable')} aria-busy={weatherLoading}>
        <div className="heatbox-head"><b>● {personal?'MY LOCATION':'KUALA LUMPUR'} HEAT INDEX</b><span>{risk?risk+' Risk':'Reading unavailable'}</span></div><div className="bigtemp">{weather?.heat_index_c??'—'}<small>°C</small></div><p>Feels-like temperature</p><div className="heatstats"><div><small>Air temperature</small><b>{weather?weather.temperature_c+'°C':'—'}</b></div><div><small>Humidity</small><b>{weather?weather.humidity+'%':'—'}</b></div><div><small>Conditions</small><b>{weather?.weather_description||'Unavailable'}</b></div></div><small className="lastread">{personal?'My location · '+(weather?.city||'Detected coordinates'):'Kuala Lumpur'} · {dt(weather?.observed_at)}</small>{personal&&userCoords&&<small className="weather-coordinates">{Number(userCoords.latitude).toFixed(4)}°, {Number(userCoords.longitude).toFixed(4)}°</small>}
      </div>
      {!isAdmin && <Panel title="Recommended action" sub="Heat safety guidance"><h2>{risk==='High'?'Reduce heat exposure':risk==='Moderate'?'Take regular precautions':risk==='Low'?'Stay prepared':'No current reading'}</h2><p className="bodytext">{weather?.advice||'Refresh the weather to load current conditions and guidance.'}</p><ul className="guidelist"><li>✓ Drink water regularly</li><li>✓ Take shade or indoor breaks</li><li>✓ Check on vulnerable people</li></ul></Panel>}
    </div>
    <div className="sectionhead"><div><h3>Risk level reference</h3><p>Classification uses calculated Heat Index, not air temperature alone.</p></div></div><div className="riskrefs"><div><b>🟢 Low</b><strong>≤ 32°C</strong><p>Stay hydrated and use sensible precautions.</p></div><div><b>🟠 Moderate</b><strong>&gt; 32°C – 40°C</strong><p>Limit strenuous outdoor activity and take shade breaks.</p></div><div><b>🔴 High</b><strong>&gt; 40°C</strong><p>Reduce exposure and move to a cooler place.</p></div></div>
  </>;
}
