const BASE = import.meta.env.VITE_API_BASE_URL || '';

export const asset = path => path ? BASE + path : '';
export const dt = value => value ? new Date(value).toLocaleString() : '—';
export const status = value => ({
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  open: 'Open',
  temporarily_closed: 'Temporarily closed',
  maintenance: 'Maintenance',
  unavailable: 'Unavailable',
  verified: 'Verified',
  expired: 'Expired',
  draft: 'Draft',
  published: 'Published',
  scheduled: 'Scheduled',
  active: 'Active',
  deactivated: 'Deactivated',
  admin: 'Administrator',
  user: 'Community member',
}[value] || value || '—');

// Format a date-only string ('YYYY-MM-DD') without timezone shifting.
export const day = value => value ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
