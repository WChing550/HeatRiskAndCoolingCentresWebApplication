const toF = c => c * 9 / 5 + 32;
const toC = f => (f - 32) * 5 / 9;

function numberInput(value, label) {
  if (
    !['number', 'string'].includes(typeof value) ||
    String(value).trim() === '' ||
    !Number.isFinite(Number(value))
  ) throw new TypeError(`${label} must be a finite number.`);
  return Number(value);
}

// NWS/WPC procedure: https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml
// Keep all intermediate values unrounded; round only the published Celsius HI.
export function calculateHeatIndex(temperature, humidity) {
  const temperatureC = numberInput(temperature, 'Temperature');
  const relativeHumidity = numberInput(humidity, 'Relative humidity');
  if (relativeHumidity < 0 || relativeHumidity > 100) {
    throw new RangeError('Relative humidity must be between 0 and 100 percent.');
  }

  const t = toF(temperatureC), r = relativeHumidity;
  const simpleF = 0.5 * (t + 61 + (t - 68) * 1.2 + r * 0.094);
  const screeningF = (simpleF + t) / 2;
  const method = screeningF >= 80 ? 'rothfusz' : 'simple';
  let terms = [], regressionF = null, adjustmentF = 0, adjustmentType = 'none';
  let finalF = screeningF;

  if (method === 'rothfusz') {
    terms = [
      {expression: '−42.379', value: -42.379},
      {expression: '+2.04901523 × T', value: 2.04901523 * t},
      {expression: '+10.14333127 × RH', value: 10.14333127 * r},
      {expression: '−0.22475541 × T × RH', value: -0.22475541 * t * r},
      {expression: '−0.00683783 × T²', value: -0.00683783 * t * t},
      {expression: '−0.05481717 × RH²', value: -0.05481717 * r * r},
      {expression: '+0.00122874 × T² × RH', value: 0.00122874 * t * t * r},
      {expression: '+0.00085282 × T × RH²', value: 0.00085282 * t * r * r},
      {expression: '−0.00000199 × T² × RH²', value: -0.00000199 * t * t * r * r},
    ];
    regressionF = terms.reduce((sum, term) => sum + term.value, 0);

    if (r < 13 && t >= 80 && t <= 112) {
      adjustmentType = 'low-humidity';
      adjustmentF = -((13 - r) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
    } else if (r > 85 && t >= 80 && t <= 87) {
      adjustmentType = 'high-humidity';
      adjustmentF = ((r - 85) / 10) * ((87 - t) / 5);
    }
    finalF = regressionF + adjustmentF;
  }

  const unroundedC = toC(finalF);
  if (!Number.isFinite(unroundedC)) throw new RangeError('Weather values exceed the calculation range.');

  return {
    version: 'nws-wpc-rothfusz-v1',
    method,
    temperature_c: temperatureC,
    temperature_f: t,
    relative_humidity: relativeHumidity,
    simple_f: simpleF,
    screening_f: screeningF,
    regression_f: regressionF,
    adjustment_type: adjustmentType,
    adjustment_f: adjustmentF,
    final_f: finalF,
    unrounded_c: unroundedC,
    heat_index_c: Math.round(unroundedC * 10) / 10,
    terms,
  };
}

export function heatIndexC(c, r) {
  return calculateHeatIndex(c, r).heat_index_c;
}
export const riskLevel=h=>h<=32?'Low':h<=40?'Moderate':'High';
export const riskAdvice=l=>l==='High'?'Move to a cooler place, drink water and reduce outdoor activity. Seek urgent help if severe symptoms develop.':l==='Moderate'?'Take shade breaks, drink water and limit strenuous outdoor activity.':'Stay hydrated and take sensible precautions during prolonged outdoor activity.';
