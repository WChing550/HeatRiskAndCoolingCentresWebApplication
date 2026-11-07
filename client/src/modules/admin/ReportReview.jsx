import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import ReportReviewModal from './ReportReviewModal.jsx';

export default function ReportReview({ ctx }) {
  const { page, isAdmin, reports = [], Panel, ReportTable, refresh, E: setError, S: setSuccess, asset, dt, Field, Photo } = ctx;
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const filteredReports = useMemo(() => reports.filter(report =>
    (filter === 'all' || report.status === filter) &&
    `${report.title} ${report.location_text} ${report.category} ${report.reporter_name || ''}`.toLowerCase().includes(search.toLowerCase())
  ), [reports, filter, search]);

  if (page !== 'reports' || !isAdmin) return null;
  return (
    <>
      <div className="queue-summary">{[['pending','Awaiting review'],['approved','Approved'],['rejected','Rejected']].map(([key,label])=><button key={key} className={'queue-stat '+(filter===key?'selected':'')} onClick={()=>setFilter(filter===key?'all':key)} aria-pressed={filter===key}><span className={'queue-dot '+key}/><span>{label}</span><b>{reports.filter(r=>r.status===key).length}</b></button>)}</div>
      <div className="toolbar">
        <div className="search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search report, category or reporter…" /></div>
        <select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
      </div>
      <Panel title="Community report queue" sub={`${filteredReports.length} submissions`}>
        <ReportTable rows={filteredReports} onSelect={setSelected} />
      </Panel>
      <ReportReviewModal selected={selected} isAdmin={isAdmin} setSelected={setSelected} refresh={refresh} setError={setError} setSuccess={setSuccess} asset={asset} dt={dt} Field={Field} Photo={Photo} />
    </>
  );
}
