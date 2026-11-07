import React, { useEffect, useRef, useState } from 'react';
import { UploadCloud, X, ImagePlus, Check, ArrowUp } from 'lucide-react';
import { MAX_CENTRE_PHOTOS, squareCrop } from '../lib/centrePhotos.js';

export default function CentrePhotoEditor({ value, onChange, onBusyChange }) {
  const [queue, setQueue] = useState([]), [dimensions, setDimensions] = useState(null), [zoom, Z] = useState(1), [pan, PAN] = useState({x:0,y:0}), [size, SIZE] = useState(300), [error, E] = useState(''), [saving, SAVE] = useState(false), [dragging, DRAG] = useState(false);
  const input = useRef(null), stage = useRef(null), image = useRef(null), pointer = useRef(null), ownedUrls = useRef(new Set());
  const current = queue[0];
  const ownUrl = file => { const url = URL.createObjectURL(file); ownedUrls.current.add(url); return url; };
  useEffect(()=>()=>ownedUrls.current.forEach(url=>URL.revokeObjectURL(url)),[]);
  useEffect(()=>{onBusyChange?.(queue.length>0||saving);return()=>onBusyChange?.(false);},[queue.length,saving,onBusyChange]);
  useEffect(()=>{
    if(!current){setDimensions(null);return;}
    let cancelled=false; Z(1);PAN({x:0,y:0});setDimensions(null);
    const img=new Image();img.onload=()=>{if(!cancelled){image.current=img;setDimensions({width:img.naturalWidth,height:img.naturalHeight});}};
    img.onerror=()=>{if(!cancelled){E('This image could not be read. Skip it and choose a JPG, PNG or WebP file.');setDimensions(null);}};
    img.src=current.url;return()=>{cancelled=true;};
  },[current]);
  useEffect(()=>{if(!stage.current)return;const observer=new ResizeObserver(entries=>SIZE(entries[0].contentRect.width));observer.observe(stage.current);return()=>observer.disconnect();},[current]);
  function addFiles(list){
    E('');const incoming=Array.from(list||[]);
    if(value.length+queue.length+incoming.length>MAX_CENTRE_PHOTOS){E(`Choose up to ${MAX_CENTRE_PHOTOS} photos in total. Remove a photo before adding more.`);return;}
    const bad=incoming.find(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5*1024*1024);
    if(bad){E('Each photo must be JPG, PNG or WebP, at most 5 MB. No files from this selection were added.');return;}
    setQueue(q=>[...q,...incoming.map(file=>({file,url:ownUrl(file)}))]);
  }
  const crop=dimensions?squareCrop(dimensions.width,dimensions.height,size,zoom,pan.x,pan.y):null;
  async function applyCrop(){
    if(!crop||saving)return;SAVE(true);E('');
    try{const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,1024,1024);context.drawImage(image.current,crop.sx,crop.sy,crop.side,crop.side,0,0,1024,1024);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(!blob)throw new Error('Unable to crop this image.');const file=new File([blob],current.file.name.replace(/\.[^.]+$/,'')+'-square.jpg',{type:'image/jpeg'});onChange([...value,{id:crypto.randomUUID(),kind:'new',file,url:ownUrl(file)}]);setQueue(q=>q.slice(1));}
    catch(e){E(e.message);}finally{SAVE(false);}
  }
  function dragMove(e){if(!pointer.current||!crop)return;const dx=e.clientX-pointer.current.x,dy=e.clientY-pointer.current.y;PAN({x:Math.max(-1,Math.min(1,pointer.current.pan.x+dx/Math.max(1,(crop.renderedWidth-size)/2))),y:Math.max(-1,Math.min(1,pointer.current.pan.y+dy/Math.max(1,(crop.renderedHeight-size)/2)))});}
  return <section className="photo-editor" aria-label="Cooling centre photos">
    <div className="photo-editor-heading"><div><h4>Centre photo gallery</h4><p>Add up to 10 photos. Crop each photo to a square before saving.</p></div><span>{value.length}/10</span></div>
    <div className={'photo-dropzone '+(dragging?'dragging':'')} onDragOver={e=>{e.preventDefault();DRAG(true);}} onDragLeave={()=>DRAG(false)} onDrop={e=>{e.preventDefault();DRAG(false);addFiles(e.dataTransfer.files);}}>
      <UploadCloud size={30}/><b>Drag and drop photos here</b><span>JPG, PNG or WebP · up to 5 MB each</span><button type="button" className="btn secondary" disabled={saving} onClick={()=>input.current.click()}><ImagePlus size={15}/>Choose multiple photos</button><input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{addFiles(e.target.files);e.target.value='';}}/>
    </div>
    {error&&<p className="notice" role="alert">{error}</p>}
    {current&&<div className="square-cropper"><div className="cropper-intro"><b>Crop photo · 1:1</b><small>{queue.length} photo{queue.length===1?'':'s'} left to crop · drag to reposition or use the sliders</small></div><div className="cropper-layout"><div className="crop-stage" ref={stage} style={{touchAction:'none'}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);pointer.current={x:e.clientX,y:e.clientY,pan:{...pan}};}} onPointerMove={dragMove} onPointerUp={()=>{pointer.current=null;}} onPointerCancel={()=>{pointer.current=null;}}>{crop?<img src={current.url} alt="Square crop preview" draggable={false} style={{width:crop.renderedWidth,height:crop.renderedHeight,left:crop.left,top:crop.top}}/>:<span>Loading image…</span>}<div className="crop-grid" aria-hidden="true"/></div><div className="crop-controls"><label>Zoom<input type="range" min="1" max="3" step=".01" value={zoom} onChange={e=>Z(Number(e.target.value))}/></label><label>Horizontal position<input type="range" min="-1" max="1" step=".01" value={pan.x} onChange={e=>PAN({...pan,x:Number(e.target.value)})}/></label><label>Vertical position<input type="range" min="-1" max="1" step=".01" value={pan.y} onChange={e=>PAN({...pan,y:Number(e.target.value)})}/></label><p>Saved as a 1024 × 1024 image. Your original file is unchanged.</p><button type="button" className="btn primary" disabled={!crop||saving} onClick={applyCrop}><Check size={15}/>{saving?'Cropping…':'Use square crop'}</button><button type="button" className="btn secondary" disabled={saving} onClick={()=>{E('');setQueue(q=>q.slice(1));}}>Skip this photo</button></div></div></div>}
    {value.length>0&&<div className="photo-editor-grid">{value.map((photo,i)=><div className="photo-edit-tile" key={photo.id}><img src={photo.url} alt={'Centre photo '+(i+1)}/><span>{i===0?'Cover photo':'Photo '+(i+1)}</span><div><button type="button" aria-label={'Remove photo '+(i+1)} title="Remove photo" onClick={()=>onChange(value.filter(p=>p.id!==photo.id))}><X size={14}/></button>{i>0&&<button type="button" aria-label={'Make photo '+(i+1)+' the cover'} title="Make cover" onClick={()=>onChange([photo,...value.filter(p=>p.id!==photo.id)])}><ArrowUp size={14}/></button>}</div></div>)}</div>}
  </section>;
}
