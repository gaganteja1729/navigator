// ============================================================
//  CAMPUS DATA  –  dummy lat/lng (replace with real values)
//  Centre reference: 17.3850° N, 78.4867° E  (Hyderabad area)
// ============================================================

/**
 * Each node:
 *  id      – unique string
 *  name    – display name
 *  floor   – 'ground' | 'first'
 *  type    – 'room' | 'staircase' | 'corridor' | 'entrance' | 'lab' | 'office'
 *  lat     – latitude  (decimal degrees)
 *  lng     – longitude (decimal degrees)
 *  icon    – emoji icon for map pin
 */
export const nodes = [
  // ── GROUND FLOOR ───────────────────────────────────────────
  {
    id: 'gf-entrance',
    name: 'Main Entrance',
    floor: 'ground',
    type: 'entrance',
    lat: 17.38500,
    lng: 78.48670,
    icon: '🚪',
  },
  {
    id: 'gf-corridor-1',
    name: 'Ground Corridor A',
    floor: 'ground',
    type: 'corridor',
    lat: 17.38510,
    lng: 78.48670,
    icon: '🔵',
  },
  {
    id: 'gf-corridor-2',
    name: 'Ground Corridor B',
    floor: 'ground',
    type: 'corridor',
    lat: 17.38520,
    lng: 78.48670,
    icon: '🔵',
  },
  {
    id: 'gf-room-101',
    name: 'Room 101 – Mathematics',
    floor: 'ground',
    type: 'room',
    lat: 17.38510,
    lng: 78.48660,
    icon: '🏫',
  },
  {
    id: 'gf-room-102',
    name: 'Room 102 – Physics',
    floor: 'ground',
    type: 'room',
    lat: 17.38520,
    lng: 78.48660,
    icon: '🏫',
  },
  {
    id: 'gf-room-103',
    name: 'Room 103 – Chemistry',
    floor: 'ground',
    type: 'room',
    lat: 17.38520,
    lng: 78.48655,
    icon: '🧪',
  },
  {
    id: 'gf-lab-comp',
    name: 'Computer Lab',
    floor: 'ground',
    type: 'lab',
    lat: 17.38510,
    lng: 78.48655,
    icon: '💻',
  },
  {
    id: 'gf-office-admin',
    name: 'Admin Office',
    floor: 'ground',
    type: 'office',
    lat: 17.38500,
    lng: 78.48660,
    icon: '🗂️',
  },
  {
    id: 'gf-cafeteria',
    name: 'Cafeteria',
    floor: 'ground',
    type: 'room',
    lat: 17.38500,
    lng: 78.48650,
    icon: '🍽️',
  },
  {
    id: 'gf-library',
    name: 'Library',
    floor: 'ground',
    type: 'room',
    lat: 17.38530,
    lng: 78.48670,
    icon: '📚',
  },
  {
    id: 'gf-wc',
    name: 'Washroom (Ground)',
    floor: 'ground',
    type: 'room',
    lat: 17.38530,
    lng: 78.48660,
    icon: '🚻',
  },
  {
    id: 'gf-stairs',
    name: 'Staircase (Ground)',
    floor: 'ground',
    type: 'staircase',
    lat: 17.38525,
    lng: 78.48665,
    icon: '🪜',
  },

  // ── FIRST FLOOR ────────────────────────────────────────────
  {
    id: 'ff-stairs',
    name: 'Staircase (First)',
    floor: 'first',
    type: 'staircase',
    lat: 17.38525,
    lng: 78.48665,
    icon: '🪜',
  },
  {
    id: 'ff-corridor-1',
    name: 'First Corridor A',
    floor: 'first',
    type: 'corridor',
    lat: 17.38515,
    lng: 78.48668,
    icon: '🔵',
  },
  {
    id: 'ff-corridor-2',
    name: 'First Corridor B',
    floor: 'first',
    type: 'corridor',
    lat: 17.38505,
    lng: 78.48668,
    icon: '🔵',
  },
  {
    id: 'ff-room-201',
    name: 'Room 201 – English',
    floor: 'first',
    type: 'room',
    lat: 17.38510,
    lng: 78.48658,
    icon: '🏫',
  },
  {
    id: 'ff-room-202',
    name: 'Room 202 – History',
    floor: 'first',
    type: 'room',
    lat: 17.38500,
    lng: 78.48658,
    icon: '🏫',
  },
  {
    id: 'ff-room-203',
    name: 'Room 203 – Economics',
    floor: 'first',
    type: 'room',
    lat: 17.38520,
    lng: 78.48658,
    icon: '📊',
  },
  {
    id: 'ff-lab-electronics',
    name: 'Electronics Lab',
    floor: 'first',
    type: 'lab',
    lat: 17.38525,
    lng: 78.48655,
    icon: '⚡',
  },
  {
    id: 'ff-seminar',
    name: 'Seminar Hall',
    floor: 'first',
    type: 'room',
    lat: 17.38530,
    lng: 78.48655,
    icon: '🎓',
  },
  {
    id: 'ff-hod-office',
    name: 'HOD Office',
    floor: 'first',
    type: 'office',
    lat: 17.38505,
    lng: 78.48655,
    icon: '🗂️',
  },
  {
    id: 'ff-wc',
    name: 'Washroom (First)',
    floor: 'first',
    type: 'room',
    lat: 17.38530,
    lng: 78.48660,
    icon: '🚻',
  },
];

/**
 * Adjacency list of edges.
 * Each edge: { from, to, weight }   (weight = approx distance in metres)
 * Graph is undirected – we add both directions below.
 */
const rawEdges = [
  // Ground floor internal
  { from: 'gf-entrance',    to: 'gf-corridor-1',  weight: 10 },
  { from: 'gf-corridor-1',  to: 'gf-corridor-2',  weight: 10 },
  { from: 'gf-corridor-2',  to: 'gf-library',     weight: 10 },
  { from: 'gf-corridor-2',  to: 'gf-wc',          weight: 8  },
  { from: 'gf-corridor-2',  to: 'gf-stairs',      weight: 5  },
  { from: 'gf-corridor-1',  to: 'gf-room-101',    weight: 8  },
  { from: 'gf-corridor-1',  to: 'gf-lab-comp',    weight: 8  },
  { from: 'gf-corridor-2',  to: 'gf-room-102',    weight: 8  },
  { from: 'gf-corridor-2',  to: 'gf-room-103',    weight: 10 },
  { from: 'gf-entrance',    to: 'gf-office-admin', weight: 8 },
  { from: 'gf-entrance',    to: 'gf-cafeteria',   weight: 12 },

  // Staircase cross-floor link
  { from: 'gf-stairs',      to: 'ff-stairs',      weight: 15 },

  // First floor internal
  { from: 'ff-stairs',       to: 'ff-corridor-1', weight: 8  },
  { from: 'ff-corridor-1',   to: 'ff-corridor-2', weight: 10 },
  { from: 'ff-corridor-1',   to: 'ff-room-201',   weight: 8  },
  { from: 'ff-corridor-1',   to: 'ff-room-203',   weight: 8  },
  { from: 'ff-corridor-2',   to: 'ff-room-202',   weight: 8  },
  { from: 'ff-corridor-2',   to: 'ff-hod-office', weight: 8  },
  { from: 'ff-stairs',       to: 'ff-lab-electronics', weight: 10 },
  { from: 'ff-stairs',       to: 'ff-wc',          weight: 8  },
  { from: 'ff-stairs',       to: 'ff-seminar',     weight: 10 },
];

// Build undirected adjacency map
export const adjacency = {};
nodes.forEach(n => { adjacency[n.id] = []; });
rawEdges.forEach(({ from, to, weight }) => {
  adjacency[from].push({ id: to, weight });
  adjacency[to].push({ id: from, weight });
});

// Node lookup map by id
export const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

/** Rooms the user can select as a destination (not corridors) */
export const selectableNodes = nodes.filter(
  n => n.type !== 'corridor'
);
