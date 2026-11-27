import React, { useState, useEffect } from 'react';
import { Search, MapPin, Images, ChevronLeft, ChevronRight, FileText, Clock3, CheckCircle2, XCircle, X } from 'lucide-react';
import { ViewportModal } from '../../components/Shared.jsx';

const categories = ['Unsafe heat conditions', 'Cooling centre issue', 'New cooling centre found', 'Heat-related incident', 'Other'];
const category = r => ['heat exposure','unsafe outdoor condition','unsafe heat condition','unsafe heat conditions'].includes((r.category || '').toLowerCase()) ? categories[0] : r.category;
const photos = r => Array.isArray(r.images) && r.images.length ? r.images.filter(Boolean) : r.image_url ? [r.image_url] : [];
const labels = { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected' };
const PAGE_SIZE = 6;

function Gallery({ report, asset }) {
  const [index, setIndex] = useState(0);
  const images = photos(report);
  const current = Math.min(index, Math.max(0, images.length - 1));
  if (!images.length) return <p className="mr-muted">No evidence photos submitted.</p>;
  return <div className="mr-gallery">
    <div className="mr-stage"><img src={asset(images[current])} alt={`Submitted evidence ${current + 1}`} />
      {images.length > 1 && <><button type="button" className="mr-prev" aria-label="Previous photo" disabled={current === 0} onClick={() => setIndex(current - 1)}><ChevronLeft /></button><button type="button" className="mr-next" aria-label="Next photo" disabled={current === images.length - 1} onClick={() => setIndex(current + 1)}><ChevronRight /></button></>}
      <span className="mr-photo-count">{current + 1} / {images.length}</span>
    </div>
    {images.length > 1 && <div className="mr-thumbs">{images.map((url, i) => <button type="button" key={i} aria-label={`View photo ${i + 1}`} aria-pressed={current === i} onClick={() => setIndex(i)}><img src={asset(url)} alt="" /></button>)}</div>}
  </div>;
}

export default function MyReports({ ctx }) {
  const { user, page, reports = [], asset, dt } = ctx;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState('newest');
  const [number, setNumber] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => { setNumber(1); }, [query, status, kind, sort]);
  const selected = reports.find(r => String(r.id) === selectedId);
  const kinds = [...new Set([...categories, ...reports.map(category).filter(Boolean)])];
  const filtered = reports.filter(r => (status === 'all' || r.status === status) && (kind === 'all' || category(r) === kind) && [r.id, r.title, r.description, r.location_text, category(r)].join(' ').toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => (sort === 'newest' ? -1 : 1) * (new Date(a.created_at) - new Date(b.created_at)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(number, pages);
  const reset = () => { setQuery(''); setStatus('all'); setKind('all'); setSort('newest'); };
  if (!user || page !== 'myreports') return null;
  return <section className="mr-dashboard">
    <div className="mr-intro"><div><h2>Your submissions</h2><p>Track your reports, evidence and review decisions in one place.</p></div></div>
    <div className="mr-summary">{[['all','Total reports',FileText],['pending','Pending review',Clock3],['approved','Approved',CheckCircle2],['rejected','Rejected',XCircle]].map(([key,label,Icon]) => <button type="button" key={key} className={`mr-stat ${key}`} aria-pressed={status === key} onClick={() => setStatus(key)}><Icon size={21}/><span><small>{label}</small><strong>{key === 'all' ? reports.length : reports.filter(r => r.status === key).length}</strong></span></button>)}</div>
    <div className="mr-toolbar"><label className="mr-search"><Search size={18}/><input aria-label="Search reports" placeholder="Search reports or locations…" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{Object.entries(labels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select><select aria-label="Filter by category" value={kind} onChange={e => setKind(e.target.value)}><option value="all">All categories</option>{kinds.map(k => <option key={k}>{k}</option>)}</select><select aria-label="Sort reports" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div>
    <div className="mr-results"><span>{filtered.length} {filtered.length === 1 ? 'report' : 'reports'}</span>{(query || status !== 'all' || kind !== 'all' || sort !== 'newest') && <button type="button" onClick={reset}>Clear filters</button>}</div>
    <div className="mr-grid">{filtered.slice((current-1)*PAGE_SIZE,current*PAGE_SIZE).map(r => { const images = photos(r); return <article className="mr-card" key={r.id}>
      <button type="button" className="mr-cover" aria-label={`View report ${r.id} details`} onClick={() => setSelectedId(String(r.id))}>{images.length ? <img loading="lazy" src={asset(images[0])} alt="Report evidence preview"/> : <span className="mr-no-photo"><Images size={30}/>No photos</span>}<span className="mr-photo-count"><Images size={14}/> {images.length} {images.length === 1 ? 'photo' : 'photos'}</span></button>
      <div className="mr-card-body"><div className="mr-meta"><span className={'pill '+r.status}>{labels[r.status] || r.status}</span><small>#{r.id} · {dt(r.created_at)}</small></div><h3>{category(r)}</h3><p className="mr-description">{r.description}</p><p className="mr-location"><MapPin size={15}/><span>{r.location_text}</span></p><button type="button" className="mr-detail" onClick={() => setSelectedId(String(r.id))}>View details <ChevronRight size={17}/></button></div>
    </article>; })}</div>
    {!filtered.length && <div className="mr-empty"><FileText size={34}/><h3>{reports.length ? 'No matching reports' : 'No reports yet'}</h3><p>{reports.length ? 'Try changing your search or filters.' : 'Submit a report to help improve heat safety.'}</p>{reports.length > 0 && <button type="button" className="btn secondary" onClick={reset}>Clear filters</button>}</div>}
    {pages > 1 && <div className="mr-pagination"><button type="button" aria-label="Previous page" disabled={current === 1} onClick={() => setNumber(current-1)}><ChevronLeft/></button><span>Page {current} of {pages}</span><button type="button" aria-label="Next page" disabled={current === pages} onClick={() => setNumber(current+1)}><ChevronRight/></button></div>}
    {selected && <ViewportModal onClose={() => setSelectedId(null)} labelledBy="mr-dialog-title"><div className="mr-dialog"><div className="mr-intro"><div><small>REPORT #{selected.id}</small><h2 id="mr-dialog-title">{category(selected)}</h2></div><button type="button" className="iconbtn" aria-label="Close report details" onClick={() => setSelectedId(null)}><X/></button></div><div className="mr-meta"><span className={'pill '+selected.status}>{labels[selected.status] || selected.status}</span><small>{dt(selected.created_at)}</small></div><h3>Description</h3><p>{selected.description}</p><h3>Location</h3><p>{selected.location_text}</p><h3>Submitted evidence ({photos(selected).length})</h3><Gallery key={selected.id} report={selected} asset={asset}/><div className="mr-feedback"><h3>Administrator feedback</h3><p>{selected.review_note || (selected.status === 'pending' ? 'Your report is waiting for review.' : 'No review note provided.')}</p>{selected.review_image_url && <><h4>Administrator review photo</h4><img src={asset(selected.review_image_url)} alt="Administrator review evidence"/></>}</div></div></ViewportModal>}
  </section>;
}
