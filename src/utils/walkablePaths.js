/**
 * Walkable Path Store
 * ─────────────────────────────────────────────────────────────
 * Segments are persisted in localStorage as JSON.
 * Each segment = a straight walkable corridor/path the admin recorded.
 *
 * Shape of a segment:
 * {
 *   id:    string,   // unique id
 *   floor: 'ground' | 'first',
 *   start: { lat, lng, label? },
 *   end:   { lat, lng, label? },
 * }
 */

const LS_KEY = 'campusWalkablePaths';

// ── Seed with some demo segments so the app is usable before admin records ──
const DEMO_SEGMENTS = [
    // Ground floor: entrance → room-101 area
    {
        id: 'd1', floor: 'ground',
        start: { lat: 17.38500, lng: 78.48670, label: 'Main Entrance' },
        end: { lat: 17.38510, lng: 78.48670, label: 'Corridor A' }
    },
    // Ground: corridor A → room 101
    {
        id: 'd2', floor: 'ground',
        start: { lat: 17.38510, lng: 78.48670, label: 'Corridor A' },
        end: { lat: 17.38510, lng: 78.48660, label: 'Room 101 – Mathematics' }
    },
    // Ground: corridor A → corridor B
    {
        id: 'd3', floor: 'ground',
        start: { lat: 17.38510, lng: 78.48670, label: 'Corridor A' },
        end: { lat: 17.38520, lng: 78.48670, label: 'Corridor B' }
    },
    // Ground: corridor B → room 102
    {
        id: 'd4', floor: 'ground',
        start: { lat: 17.38520, lng: 78.48670, label: 'Corridor B' },
        end: { lat: 17.38520, lng: 78.48660, label: 'Room 102 – Physics' }
    },
    // Ground: corridor B → room 103
    {
        id: 'd5', floor: 'ground',
        start: { lat: 17.38520, lng: 78.48670, label: 'Corridor B' },
        end: { lat: 17.38520, lng: 78.48655, label: 'Room 103 – Chemistry' }
    },
    // Ground: corridor A → computer lab
    {
        id: 'd6', floor: 'ground',
        start: { lat: 17.38510, lng: 78.48670, label: 'Corridor A' },
        end: { lat: 17.38510, lng: 78.48655, label: 'Computer Lab' }
    },
    // Ground: entrance → admin office
    {
        id: 'd7', floor: 'ground',
        start: { lat: 17.38500, lng: 78.48670, label: 'Main Entrance' },
        end: { lat: 17.38500, lng: 78.48660, label: 'Admin Office' }
    },
    // Ground: entrance → cafeteria
    {
        id: 'd8', floor: 'ground',
        start: { lat: 17.38500, lng: 78.48670, label: 'Main Entrance' },
        end: { lat: 17.38500, lng: 78.48650, label: 'Cafeteria' }
    },
    // Ground: corridor B → library
    {
        id: 'd9', floor: 'ground',
        start: { lat: 17.38520, lng: 78.48670, label: 'Corridor B' },
        end: { lat: 17.38530, lng: 78.48670, label: 'Library' }
    },
    // Ground: library → WC
    {
        id: 'd10', floor: 'ground',
        start: { lat: 17.38530, lng: 78.48670, label: 'Library' },
        end: { lat: 17.38530, lng: 78.48660, label: 'Washroom (Ground)' }
    },
    // Ground → staircase
    {
        id: 'd11', floor: 'ground',
        start: { lat: 17.38530, lng: 78.48660, label: 'Washroom (Ground)' },
        end: { lat: 17.38525, lng: 78.48665, label: 'Staircase (Ground)' }
    },

    // Staircase cross-floor (virtual segment)
    {
        id: 'd-stairs', floor: 'ground',
        start: { lat: 17.38525, lng: 78.48665, label: 'Staircase (Ground)' },
        end: { lat: 17.38525, lng: 78.48665, label: 'Staircase (First)' },
        crossFloor: true, toFloor: 'first'
    },

    // First floor segments
    {
        id: 'f1', floor: 'first',
        start: { lat: 17.38525, lng: 78.48665, label: 'Staircase (First)' },
        end: { lat: 17.38515, lng: 78.48668, label: 'First Corridor A' }
    },
    {
        id: 'f2', floor: 'first',
        start: { lat: 17.38515, lng: 78.48668, label: 'First Corridor A' },
        end: { lat: 17.38510, lng: 78.48658, label: 'Room 201 – English' }
    },
    {
        id: 'f3', floor: 'first',
        start: { lat: 17.38515, lng: 78.48668, label: 'First Corridor A' },
        end: { lat: 17.38520, lng: 78.48658, label: 'Room 203 – Economics' }
    },
    {
        id: 'f4', floor: 'first',
        start: { lat: 17.38515, lng: 78.48668, label: 'First Corridor A' },
        end: { lat: 17.38505, lng: 78.48668, label: 'First Corridor B' }
    },
    {
        id: 'f5', floor: 'first',
        start: { lat: 17.38505, lng: 78.48668, label: 'First Corridor B' },
        end: { lat: 17.38500, lng: 78.48658, label: 'Room 202 – History' }
    },
    {
        id: 'f6', floor: 'first',
        start: { lat: 17.38505, lng: 78.48668, label: 'First Corridor B' },
        end: { lat: 17.38505, lng: 78.48655, label: 'HOD Office' }
    },
    {
        id: 'f7', floor: 'first',
        start: { lat: 17.38525, lng: 78.48665, label: 'Staircase (First)' },
        end: { lat: 17.38525, lng: 78.48655, label: 'Electronics Lab' }
    },
    {
        id: 'f8', floor: 'first',
        start: { lat: 17.38525, lng: 78.48665, label: 'Staircase (First)' },
        end: { lat: 17.38530, lng: 78.48655, label: 'Seminar Hall' }
    },
    {
        id: 'f9', floor: 'first',
        start: { lat: 17.38525, lng: 78.48665, label: 'Staircase (First)' },
        end: { lat: 17.38530, lng: 78.48660, label: 'Washroom (First)' }
    },
];

// ── Load / Save ────────────────────────────────────────────────

export function loadSegments() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (_) { }
    return DEMO_SEGMENTS;
}

export function saveSegments(segments) {
    localStorage.setItem(LS_KEY, JSON.stringify(segments));
}

export function addSegment(segment) {
    const all = loadSegments();
    const next = [...all, segment];
    saveSegments(next);
    return next;
}

export function deleteSegment(id) {
    const next = loadSegments().filter(s => s.id !== id);
    saveSegments(next);
    return next;
}

export function exportToJson(segments) {
    const json = JSON.stringify({ segments }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'campus_paths.json';
    a.click(); URL.revokeObjectURL(url);
}

export function importFromJson(jsonText) {
    const data = JSON.parse(jsonText);
    const segs = Array.isArray(data) ? data : (data.segments ?? []);
    saveSegments(segs);
    return segs;
}

// ── Build pathfinding graph from segments ──────────────────────
// Merges nearby endpoints (within MERGE_DIST metres) into one node.

export const MERGE_DIST = 3; // metres — endpoints closer than this are the same node

import { haversineMetres } from './pathfinder.js';

export function buildGraphFromSegments(segments) {
    const nodes = [];   // { id, lat, lng, floor, label }
    const edges = [];   // { from, to, weight, crossFloor?, toFloor? }

    const findOrCreateNode = (lat, lng, floor, label = '') => {
        for (const n of nodes) {
            if (n.floor === floor || (label.toLowerCase().includes('stair'))) {
                const d = haversineMetres(lat, lng, n.lat, n.lng);
                if (d < MERGE_DIST) return n.id;
            }
        }
        const id = `wn-${nodes.length}`;
        nodes.push({ id, lat, lng, floor, label });
        return id;
    };

    for (const seg of segments) {
        const startFloor = seg.floor;
        const endFloor = seg.crossFloor ? (seg.toFloor ?? startFloor) : startFloor;

        const sId = findOrCreateNode(seg.start.lat, seg.start.lng, startFloor, seg.start.label ?? '');
        const eId = findOrCreateNode(seg.end.lat, seg.end.lng, endFloor, seg.end.label ?? '');

        if (sId === eId) continue; // degenerate segment

        const w = haversineMetres(seg.start.lat, seg.start.lng, seg.end.lat, seg.end.lng);
        edges.push({ from: sId, to: eId, weight: Math.max(w, 1), crossFloor: !!seg.crossFloor });
        edges.push({ from: eId, to: sId, weight: Math.max(w, 1), crossFloor: !!seg.crossFloor });
    }

    // Build adjacency
    const adjacency = {};
    nodes.forEach(n => { adjacency[n.id] = []; });
    edges.forEach(({ from, to, weight }) => {
        adjacency[from].push({ id: to, weight });
    });

    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

    return { nodes, nodeMap, adjacency };
}
