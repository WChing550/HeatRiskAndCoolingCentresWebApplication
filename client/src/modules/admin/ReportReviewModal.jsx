import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { X, CheckCircle2, XCircle } from 'lucide-react';

export default function ReportReviewModal({ selected, isAdmin, setSelected, refresh, setError, setSuccess, asset, dt, Field, Photo }) {
  const [rv, setRv] = useState({ status: 'approved', note: '' });
  const [reviewPhoto, setReviewPhoto] = useState(null);

  async function reviewReport(event) {
    event.preventDefault();
    if (!selected) return;
    const formData = new FormData();
    formData.append('status', rv.status);
    formData.append('note', rv.note);
    if (reviewPhoto) formData.append('reviewImage', reviewPhoto);
    try {
      await api(`/admin/reports/${selected.id}/review`, { method: 'POST', body: formData });
      setSuccess(`Report ${rv.status}.`);
      setSelected(null);
      setReviewPhoto(null);
      setRv({ status: 'approved', note: '' });
      await refresh();
    } catch (error) {
      setError(error.message);
    }
  }

  if (!selected) return null;
  return (
    <div className="overlay" onClick={() => setSelected(null)}>
      <div className="modal" onClick={event => event.stopPropagation()}>
        <div className="modalhead">
          <div><small>REPORT REVIEW · #{selected.id}</small><h2>{selected.title}</h2></div>
          <button className="iconbtn" onClick={() => setSelected(null)}><X /></button>
        </div>
        <div className="metarow"><span>{selected.reporter_name || 'Your report'}</span><span>⌖ {selected.location_text}</span><span>{dt(selected.created_at)}</span></div>
        <span className="tag">{selected.category}</span><p>{selected.description}</p>
        {selected.image_url && <div className="evidence"><b>Submitted evidence</b><img src={asset(selected.image_url)} alt="Submitted evidence" /></div>}
        {selected.review_note && <div className="reviewnote"><b>Review note</b><p>{selected.review_note}</p></div>}
        {selected.review_image_url && <div className="evidence"><b>Administrator review photo</b><img src={asset(selected.review_image_url)} alt="Administrator review evidence" /></div>}
        {isAdmin && <form className="stack" onSubmit={reviewReport}>
          <Field label="Decision"><select value={rv.status} onChange={event => setRv(previous => ({ ...previous, status: event.target.value }))}><option value="approved">Approve report</option><option value="rejected">Reject report</option></select></Field>
          <Field label={rv.status === 'rejected' ? 'Rejection reason (required)' : 'Review note (optional)'}><textarea rows="3" required={rv.status === 'rejected'} value={rv.note} onChange={event => setRv(previous => ({ ...previous, note: event.target.value }))} /></Field>
          <Photo label="Review evidence photo (optional)" file={reviewPhoto} onChange={setReviewPhoto} />
          <div className="actions"><button type="button" className="btn secondary" onClick={() => setSelected(null)}>Cancel</button><button className="btn primary">{rv.status === 'approved' ? <><CheckCircle2 size={16} /> Approve</> : <><XCircle size={16} /> Reject</>}</button></div>
        </form>}
      </div>
    </div>
  );
}
