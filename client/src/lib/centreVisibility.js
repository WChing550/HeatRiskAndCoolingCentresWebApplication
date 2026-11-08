export function isPublishedCentre(centre) {
  if (!centre || centre.verified !== true || centre.expired === true) return false;
  return [centre.effective_status, centre.verification_status].every(status => status == null || status === 'verified');
}
