import React, { useRef, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { asset } from '../lib/api.js';

export default function CentreGallery({photos, name}) {
  const track=useRef(null), [index,I]=useState(0);
  const go=i=>{const node=track.current;if(node)node.scrollTo({left:i*node.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  if(!photos.length)return <div className="gallery-empty"><Building2 size={50}/><span>No centre photos yet</span></div>;
  return <section className="centre-gallery" aria-label={name+' photo gallery'}>
    <div className="gallery-viewport"><div ref={track} className="gallery-track" onScroll={e=>I(Math.round(e.currentTarget.scrollLeft/e.currentTarget.clientWidth))}>{photos.map((url,i)=><figure key={url}><img src={asset(url)} alt={`${name} · photo ${i+1} of ${photos.length}`}/></figure>)}</div>{photos.length>1&&<><button type="button" className="gallery-arrow previous" aria-label="Previous photo" disabled={index===0} onClick={()=>go(index-1)}><ChevronLeft size={19}/></button><button type="button" className="gallery-arrow next" aria-label="Next photo" disabled={index===photos.length-1} onClick={()=>go(index+1)}><ChevronRight size={19}/></button></>}<span className="gallery-count" aria-live="polite">{index+1} / {photos.length}</span></div>
    {photos.length>1&&<><div className="gallery-thumbnails">{photos.map((url,i)=><button type="button" key={url} aria-label={'View photo '+(i+1)} aria-pressed={i===index} onClick={()=>go(i)}><img src={asset(url)} alt=""/></button>)}</div></>}
  </section>;
}
