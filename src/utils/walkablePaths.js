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

// ── Load / Save ────────────────────────────────────────────────

export function loadSegments() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (_) { }
    return [];   // start empty — admin records the real paths
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
