import React from 'react';

export default function MyReports({ ctx }) {
  const { user, page, reports, Panel, ReportCard, Empty } = ctx;
  return (<>
    {page === 'myreports' && user && <Panel title="Your submissions" sub="Check status and read the administrator's decision."><div className="reportcards">{reports.map(r => <ReportCard key={r.id} r={r} />)}</div>{!reports.length && <Empty title="No reports submitted yet" text="Submit a heat-related concern with its location and optional photo evidence." />}</Panel>}
  </>);
}
