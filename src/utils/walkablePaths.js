/**
 * Walkable Path Store
 * ─────────────────────────────────────────────────────────────
 * Segments and admin location coordinates are persisted via server API.
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

const API_URL = '/api/nav-data';
const LEGACY_SEGMENTS_KEY = 'campusWalkablePaths';
const LEGACY_LOCATIONS_KEY = 'campus_loc_coords';

let migrationChecked = false;

function getApiCandidates() {
    if (typeof window === 'undefined') return [API_URL];
    const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    return isLocalHost ? [API_URL, 'http://localhost:5000/api/nav-data'] : [API_URL];
}

async function fetchFromCandidates(init) {
    const urls = getApiCandidates();
    let lastError = null;

    for (const url of urls) {
        try {
            const res = await fetch(url, init);
            if (res.ok) return res;
            if (res.status >= 500) {
                lastError = new Error(`Server error: ${res.status}`);
                continue;
            }
            lastError = new Error(`Request failed: ${res.status}`);
            if (res.status === 404) continue;
            throw lastError;
        } catch (err) {
            lastError = err;
        }
    }

    throw (lastError ?? new Error('API request failed'));
}

function readLegacyData() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return { segments: [], locationCoords: {} };
    }

    let segments = [];
    let locationCoords = {};

    try {
        const rawSegments = window.localStorage.getItem(LEGACY_SEGMENTS_KEY);
        if (rawSegments) {
            const parsed = JSON.parse(rawSegments);
            if (Array.isArray(parsed)) segments = parsed;
        }
    } catch (_) { }

    try {
        const rawLocs = window.localStorage.getItem(LEGACY_LOCATIONS_KEY);
        if (rawLocs) {
            const parsed = JSON.parse(rawLocs);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                locationCoords = parsed;
            }
        }
    } catch (_) { }

    return { segments, locationCoords };
}

async function getNavData() {
    try {
        const res = await fetchFromCandidates();
        const data = await res.json();
        const normalized = {
            segments: Array.isArray(data?.segments) ? data.segments : [],
            locationCoords: data?.locationCoords && typeof data.locationCoords === 'object' && !Array.isArray(data.locationCoords)
                ? data.locationCoords
                : {},
        };

        if (!migrationChecked) {
            migrationChecked = true;
            const serverEmpty = normalized.segments.length === 0 && Object.keys(normalized.locationCoords).length === 0;
            if (serverEmpty) {
                const legacy = readLegacyData();
                const hasLegacy = legacy.segments.length > 0 || Object.keys(legacy.locationCoords).length > 0;
                if (hasLegacy) {
                    const migrated = await putNavData(legacy);
                    return {
                        segments: Array.isArray(migrated?.segments) ? migrated.segments : [],
                        locationCoords: migrated?.locationCoords && typeof migrated.locationCoords === 'object' && !Array.isArray(migrated.locationCoords)
                            ? migrated.locationCoords
                            : {},
                    };
                }
            }
        }

        return normalized;
    } catch (_) {
        return { segments: [], locationCoords: {} };
    }
}

async function putNavData(data) {
    const payload = {
        segments: Array.isArray(data?.segments) ? data.segments : [],
        locationCoords: data?.locationCoords && typeof data.locationCoords === 'object' && !Array.isArray(data.locationCoords)
            ? data.locationCoords
            : {},
    };

    const res = await fetchFromCandidates({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return res.json();
}

// ── Load / Save ────────────────────────────────────────────────

export function loadSegments() {
    return getNavData().then(data => data.segments);
}

export function saveSegments(segments) {
    return getNavData().then(data => putNavData({ ...data, segments })).then(saved => saved.segments);
}

export function addSegment(segment) {
    return loadSegments().then(all => {
        const next = [...all, segment];
        return saveSegments(next);
    });
}

export function deleteSegment(id) {
    return loadSegments().then(all => {
        const next = all.filter(s => s.id !== id);
        return saveSegments(next);
    });
}

export function loadLocCoords() {
    return getNavData().then(data => data.locationCoords);
}

export function saveLocCoords(locationCoords) {
    return getNavData().then(data => putNavData({ ...data, locationCoords })).then(saved => saved.locationCoords);
}

export function exportToJson(segments) {
    const json = JSON.stringify({ segments }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'campus_paths.json';
    a.click(); URL.revokeObjectURL(url);
}

export async function importFromJson(jsonText) {
    const data = JSON.parse(jsonText);
    const segs = Array.isArray(data) ? data : (data.segments ?? []);
    await saveSegments(segs);
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
