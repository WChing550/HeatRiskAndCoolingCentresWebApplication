export const MAX_CENTRE_PHOTOS = 10;

export function centrePhotos(centre) {
  const urls = Array.isArray(centre?.image_urls) ? centre.image_urls.filter(Boolean) : [];
  return [...new Set(urls.length ? urls : centre?.image_url ? [centre.image_url] : [])];
}

// Pan is normalised to [-1, 1]; every valid crop stays inside the source image.
export function squareCrop(width, height, size, zoom = 1, panX = 0, panY = 0) {
  if (![width, height, size, zoom].every(v => Number.isFinite(v) && v > 0)) throw new Error('Invalid crop dimensions.');
  const scale = Math.max(size / width, size / height) * Math.max(1, zoom);
  const renderedWidth = width * scale, renderedHeight = height * scale;
  const left = (size - renderedWidth) / 2 + Math.max(-1, Math.min(1, panX)) * (renderedWidth - size) / 2;
  const top = (size - renderedHeight) / 2 + Math.max(-1, Math.min(1, panY)) * (renderedHeight - size) / 2;
  return { scale, renderedWidth, renderedHeight, left, top, sx: -left / scale, sy: -top / scale, side: size / scale };
}
