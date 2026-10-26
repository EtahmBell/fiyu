export interface Point { x: number; y: number }
export interface LatLng { lat: number; lng: number }
export const VIEWBOX_WIDTH = 1000;
export const VIEWBOX_HEIGHT = 1026;
export const TOKYO_BOUNDS = { west: 139.56, east: 139.92, south: 35.52, north: 35.82 } as const;
function mercatorY(lat: number) { return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)); }
const northY = mercatorY(TOKYO_BOUNDS.north);
const mercatorSpan = northY - mercatorY(TOKYO_BOUNDS.south);
export function roundNumber(value: number) { return Math.round(value * 100) / 100; }
export function project({ lat, lng }: LatLng): Point { return { x: roundNumber(((lng - TOKYO_BOUNDS.west) / (TOKYO_BOUNDS.east - TOKYO_BOUNDS.west)) * VIEWBOX_WIDTH), y: roundNumber(((northY - mercatorY(lat)) / mercatorSpan) * VIEWBOX_HEIGHT) }; }
export function isWithinBounds({ lat, lng }: LatLng) { return lat >= TOKYO_BOUNDS.south && lat <= TOKYO_BOUNDS.north && lng >= TOKYO_BOUNDS.west && lng <= TOKYO_BOUNDS.east; }
export function toPath(coordinates: readonly LatLng[], close = false) { return coordinates.map((coordinate, index) => { const point = project(coordinate); return `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`; }).join(" ") + (close ? " Z" : ""); }
