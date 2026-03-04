/**
 * Walkable Path Store
 * ─────────────────────────────────────────────────────────────
 * Data is stored in src/data/navData.json (bundled with the app).
 *
 * HOW TO SAVE:
 *   1. In the Admin Path Recorder, use the ⬇ Export button after recording paths.
 *   2. Replace src/data/navData.json with the downloaded file.
 *   3. Redeploy / rebuild the app.
 *
 * Shape of navData.json:
 * {
 *   segments: [{ id, floor, start: {lat,lng,label}, end: {lat,lng,label} }],
 *   locationCoords: { "Place Name": { lat, lng }, ... }
 * }
 */

import navData from '../data/navData.json';

// ── In-memory store (loaded from bundled JSON) ─────────────────
let _segments = Array.isArray(navData?.segments) ? navData.segments : [];
let _locationCoords =
    navData?.locationCoords && typeof navData.locationCoords === 'object' && !Array.isArray(navData.locationCoords)
        ? navData.locationCoords
        : {};

// ── Load (just returns the in-memory copy) ─────────────────────

export function loadSegments() {
    return Promise.resolve([..._segments]);
}

export function loadLocCoords() {
    return Promise.resolve({ ..._locationCoords });
}

// ── Mutate in-memory + trigger JSON download for persistence ───

export function saveSegments(segments) {
    _segments = Array.isArray(segments) ? segments : [];
    return Promise.resolve([..._segments]);
}

export function saveLocCoords(locationCoords) {
    _locationCoords =
        locationCoords && typeof locationCoords === 'object' && !Array.isArray(locationCoords)
            ? locationCoords
            : {};
    return Promise.resolve({ ..._locationCoords });
}

export function addSegment(segment) {
    _segments = [..._segments, segment];
    return Promise.resolve([..._segments]);
}

export function deleteSegment(id) {
    _segments = _segments.filter(s => s.id !== id);
    return Promise.resolve([..._segments]);
}

// ── Export current in-memory data as navData.json download ─────
export function exportToJson(segments) {
    const data = { segments: _segments, locationCoords: _locationCoords };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'navData.json';
    a.click();
    URL.revokeObjectURL(url);
}

// ── Import JSON file — load into memory ────────────────────────
export async function importFromJson(jsonText) {
    const data = JSON.parse(jsonText);
    const segs = Array.isArray(data)
        ? data
        : Array.isArray(data?.segments)
            ? data.segments
            : [];
    const locs =
        data?.locationCoords && typeof data.locationCoords === 'object' && !Array.isArray(data.locationCoords)
            ? data.locationCoords
            : {};
    _segments = segs;
    _locationCoords = locs;
    return segs;
}

// ── Build pathfinding graph from segments ──────────────────────
export const MERGE_DIST = 3; // metres — endpoints closer than this are the same node

import { haversineMetres } from './pathfinder.js';

export const STAIR_LINK_DIST = 15; // metres — stair nodes within this are linked cross-floor
export const STAIR_WEIGHT = 50;    // equivalent metres for climbing a floor

export function buildGraphFromSegments(segments) {
    const nodes = [];   // { id, lat, lng, floor, label }
    const edges = [];   // { from, to, weight, crossFloor? }

    // Always match by SAME floor — no cross-floor merging here
    const findOrCreateNode = (lat, lng, floor, label = '') => {
        for (const n of nodes) {
            if (n.floor === floor) {
                const d = haversineMetres(lat, lng, n.lat, n.lng);
                if (d < MERGE_DIST) return n.id;
            }
        }
        const id = `wn-${nodes.length}`;
        nodes.push({ id, lat, lng, floor, label });
        return id;
    };

    for (const seg of segments) {
        const startFloor = seg.floor ?? 'ground';
        const endFloor = seg.crossFloor ? (seg.toFloor ?? startFloor) : startFloor;
        const sId = findOrCreateNode(seg.start.lat, seg.start.lng, startFloor, seg.start.label ?? '');
        const eId = findOrCreateNode(seg.end.lat, seg.end.lng, endFloor, seg.end.label ?? '');
        if (sId === eId) continue;
        const w = haversineMetres(seg.start.lat, seg.start.lng, seg.end.lat, seg.end.lng);
        edges.push({ from: sId, to: eId, weight: Math.max(w, 1), crossFloor: !!seg.crossFloor });
        edges.push({ from: eId, to: sId, weight: Math.max(w, 1), crossFloor: !!seg.crossFloor });
    }

    // ── Auto-link stair nodes across floors ──────────────────
    const stairNodes = nodes.filter(n => n.label.toLowerCase().includes('stair'));
    for (let i = 0; i < stairNodes.length; i++) {
        for (let j = i + 1; j < stairNodes.length; j++) {
            const a = stairNodes[i], b = stairNodes[j];
            if (a.floor === b.floor) continue;  // must be different floors
            const d = haversineMetres(a.lat, a.lng, b.lat, b.lng);
            if (d > STAIR_LINK_DIST) continue;
            // Link these stair nodes bidirectionally as cross-floor edges
            edges.push({ from: a.id, to: b.id, weight: STAIR_WEIGHT, crossFloor: true });
            edges.push({ from: b.id, to: a.id, weight: STAIR_WEIGHT, crossFloor: true });
        }
    }

    const adjacency = {};
    nodes.forEach(n => { adjacency[n.id] = []; });
    edges.forEach(({ from, to, weight, crossFloor }) => {
        adjacency[from].push({ id: to, weight, crossFloor: !!crossFloor });
    });

    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
    return { nodes, nodeMap, adjacency };
}
