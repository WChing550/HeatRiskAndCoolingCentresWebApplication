export function feelsLikeC(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < -100 || Number(value) > 100) {
    throw new TypeError('Feels-like temperature must be a finite Celsius value.');
  }
  return Math.round(Number(value) * 10) / 10;
}
export const riskLevel = value => value <= 32 ? 'Low' : value <= 40 ? 'Moderate' : 'High';
export const riskAdvice = level => level === 'High'
  ? 'Move to a cooler place, drink water and reduce outdoor activity. Seek urgent help if severe symptoms develop.'
  : level === 'Moderate' ? 'Take shade breaks, drink water and limit strenuous outdoor activity.'
  : 'Stay hydrated and take sensible precautions during prolonged outdoor activity.';
