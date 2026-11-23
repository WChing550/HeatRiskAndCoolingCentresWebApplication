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
  let response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      credentials: 'include',
      ...options,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (error.name === 'AbortError' || options.signal?.aborted) throw error;
    const err = new Error('Cannot connect to the API server. Check that the server is running, then try again.');
    err.code = 'NETWORK_ERROR';
    throw err;
  }
  let unreadable = false;
  const data = await response.json().catch(() => { unreadable = true; return {}; });
  if (!response.ok) {
    const missingAddressRoute = response.status === 404 && path.startsWith('/admin/centre-locations/');
    const fallback = missingAddressRoute
      ? 'Address verification is not available on this API server. Update the server files and restart the API server, then try again.'
      : ({
          401: 'Your session has expired. Sign in again.',
          403: 'You do not have permission to perform this action.',
          404: 'The requested service or record could not be found.',
          429: 'Too many requests. Wait a minute, then try again.',
          502: 'The API server is temporarily unavailable. Please try again.',
          503: 'The service is temporarily unavailable. Please try again.',
          504: 'The server took too long to respond. Please try again.',
        }[response.status] || `Request failed (HTTP ${response.status}).`);
    const message = !missingAddressRoute && typeof data?.error === 'string' && data.error.trim() ? data.error : fallback;
    const err = new Error(message);
    err.status = response.status;
    err.code = missingAddressRoute ? 'ADDRESS_SERVICE_UNAVAILABLE' : data?.code;
    throw err;
  }
  if (unreadable && response.status !== 204) {
    const err = new Error('The API server returned an unreadable response. Check that the API server is running, then try again.');
    err.status = response.status;
    err.code = 'INVALID_RESPONSE';
    throw err;
  }
  return data;
}
