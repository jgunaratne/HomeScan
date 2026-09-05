import { M2FT } from './constants.js';

let unit = 'm';
export const len = m => unit === 'm' ? m.toFixed(2)+' m' : (m*M2FT).toFixed(1)+' ft';
export const area = a => unit === 'm' ? a.toFixed(1)+' m²' : Math.round(a*10.7639)+' sq ft';

export function toggleUnit(){ return unit = unit === 'm' ? 'ft' : 'm'; }
export const unitName = () => unit === 'm' ? 'metres' : 'feet';
