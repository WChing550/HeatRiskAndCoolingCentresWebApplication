const toF=c=>c*9/5+32;const toC=f=>(f-32)*5/9;
export function heatIndexC(c,r){const t=toF(c);if(t<80||r<40)return Math.round(c*10)/10;let h=-42.379+2.04901523*t+10.14333127*r-.22475541*t*r-.00683783*t*t-.05481717*r*r+.00122874*t*t*r+.00085282*t*r*r-.00000199*t*t*r*r;if(r<13&&t<=112)h-=((13-r)/4)*Math.sqrt((17-Math.abs(t-95))/17);if(r>85&&t<=87)h+=((r-85)/10)*((87-t)/5);return Math.round(toC(h)*10)/10}
export const riskLevel=h=>h<=32?'Low':h<=40?'Moderate':'High';
export const riskAdvice=l=>l==='High'?'Move to a cooler place, drink water and reduce outdoor activity. Seek urgent help if severe symptoms develop.':l==='Moderate'?'Take shade breaks, drink water and limit strenuous outdoor activity.':'Stay hydrated and take sensible precautions during prolonged outdoor activity.';
