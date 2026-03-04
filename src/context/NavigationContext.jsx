import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { nodes as campusNodes, nodeMap as campusNodeMap, selectableNodes } from '../data/campusData.js';
import { haversineMetres, bearing } from '../utils/pathfinder.js';
import { loadSegments, buildGraphFromSegments } from '../utils/walkablePaths.js';

const NavCtx = createContext(null);

// ── localStorage key for admin-saved location coords ─────────
const LOC_STORAGE_KEY = 'campus_loc_coords';

function loadLocCoords() {
    try { return JSON.parse(localStorage.getItem(LOC_STORAGE_KEY) || '{}'); }
    catch { return {}; }
}

// ── A* on any graph ──────────────────────────────────────────
function aStarOnGraph(startId, goalId, adjacency, nodeMap) {
    if (startId === goalId) return [startId];
    const goalNode = nodeMap[goalId];
    if (!goalNode) return null;
    const h = id => { const n = nodeMap[id]; return n ? haversineMetres(n.lat, n.lng, goalNode.lat, goalNode.lng) : Infinity; };
    const open = new Set([startId]);
    const cameFrom = {};
    const gScore = { [startId]: 0 };
    const fScore = { [startId]: h(startId) };
    while (open.size > 0) {
        let current = null, lowest = Infinity;
        for (const id of open) { const f = fScore[id] ?? Infinity; if (f < lowest) { lowest = f; current = id; } }
        if (current === goalId) {
            const path = [current];
            while (cameFrom[current]) { current = cameFrom[current]; path.unshift(current); }
            return path;
        }
        open.delete(current);
        for (const { id: nb, weight } of (adjacency[current] || [])) {
            const tg = (gScore[current] ?? Infinity) + weight;
            if (tg < (gScore[nb] ?? Infinity)) {
                cameFrom[nb] = current; gScore[nb] = tg; fScore[nb] = tg + h(nb); open.add(nb);
            }
        }
    }
    return null;
}

function nearestWalkableNode(lat, lng, floor, graphNodes) {
    let best = null, bestDist = Infinity;
    for (const n of graphNodes) {
        if (floor && n.floor !== floor) continue;
        const d = haversineMetres(lat, lng, n.lat, n.lng);
        if (d < bestDist) { bestDist = d; best = n; }
    }
    return best;
}

function nearestNodeOnPath(lat, lng, pathIds, nodeMap) {
    let best = null, bestDist = Infinity;
    for (const id of pathIds) {
        const n = nodeMap[id];
        if (!n) continue;
        const d = haversineMetres(lat, lng, n.lat, n.lng);
        if (d < bestDist) { bestDist = d; best = n; }
    }
    return { node: best, dist: bestDist };
}

// ── Project a point onto the nearest segment of the route path ──
// Returns { lat, lng, dist, segIdx } where dist = distance from
// original point to the projected (snapped) point in metres,
// and segIdx = index of the segment start node in the path.
function snapToPath(lat, lng, pathIds, nodeMap) {
    let bestLat = lat, bestLng = lng, bestDist = Infinity, bestSeg = 0;

    for (let i = 0; i < pathIds.length - 1; i++) {
        const a = nodeMap[pathIds[i]];
        const b = nodeMap[pathIds[i + 1]];
        if (!a || !b) continue;

        // Project onto segment A→B using flat-earth approximation
        const ax = 0, ay = 0;
        const bx = (b.lng - a.lng) * mPerLng(a.lat);
        const by = (b.lat - a.lat) * M_PER_LAT;
        const px = (lng - a.lng) * mPerLng(a.lat);
        const py = (lat - a.lat) * M_PER_LAT;

        const abx = bx - ax, aby = by - ay;
        const lenSq = abx * abx + aby * aby;
        let t = lenSq > 0 ? ((px - ax) * abx + (py - ay) * aby) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));

        const projX = ax + t * abx;
        const projY = ay + t * aby;
        const dx = px - projX, dy = py - projY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < bestDist) {
            bestDist = dist;
            bestLat = a.lat + projY / M_PER_LAT;
            bestLng = a.lng + projX / mPerLng(a.lat);
            bestSeg = i;
        }
    }

    // Also check individual nodes (handles single-node paths)
    for (let i = 0; i < pathIds.length; i++) {
        const n = nodeMap[pathIds[i]];
        if (!n) continue;
        const d = haversineMetres(lat, lng, n.lat, n.lng);
        if (d < bestDist) {
            bestDist = d;
            bestLat = n.lat;
            bestLng = n.lng;
            bestSeg = Math.max(0, i - 1);
        }
    }

    return { lat: bestLat, lng: bestLng, dist: bestDist, segIdx: bestSeg };
}

// Approximate metres per degree
const M_PER_LAT = 111320;
const mPerLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

// ── Direction instruction: user heading vs bearing to next waypoint ──
// userHeading = direction the user is physically facing (0–360°, 0=North)
// bearingToWaypoint = compass bearing from user's position to next waypoint
// diff > 0 → user needs to turn right; diff < 0 → turn left
function getDirectionFromHeading(userHeading, bearingToWaypoint) {
    let diff = (bearingToWaypoint - userHeading + 360) % 360;
    if (diff > 180) diff -= 360; // normalise to −180 … +180
    if (Math.abs(diff) < 20) return '⬆️ Go straight';
    if (diff >= 20 && diff < 70) return '↗️ Slight right';
    if (diff >= 70 && diff < 120) return '➡️ Turn right';
    if (diff >= 120) return '↩️ Sharp right';
    if (diff <= -20 && diff > -70) return '↖️ Slight left';
    if (diff <= -70 && diff > -120) return '⬅️ Turn left';
    if (diff <= -120) return '↩️ Sharp left';
    return '⬆️ Go straight';
}

const SNAP_DIST = 30;     // metres — snap to track if within this
const OFF_TRACK_DIST = 30; // metres — show off-track warning beyond this

export function NavigationProvider({ children }) {
    // ── Screen history stack ──────────────────────────────────
    const [screenStack, setScreenStack] = useState(['floor-select']);
    const currentScreen = screenStack[screenStack.length - 1];

    const navigate = useCallback((screen) => {
        setScreenStack(s => [...s, screen]);
    }, []);

    const goBack = useCallback(() => {
        setScreenStack(s => (s.length > 1 ? s.slice(0, -1) : s));
    }, []);

    // ── Floor ──────────────────────────────────────────────────
    const [currentFloor, setCurrentFloor] = useState(null);

    const selectFloor = useCallback((floor) => {
        setCurrentFloor(floor);
        setScreenStack(['home']);
    }, []);

    const changeFloor = useCallback((floor) => {
        setCurrentFloor(floor);
    }, []);

    // ── GPS ───────────────────────────────────────────────────
    const [gpsPos, setGpsPos] = useState(null);
    const [gpsError, setGpsError] = useState(null);

    useEffect(() => {
        if (!navigator.geolocation) { setGpsError('Geolocation not supported'); return; }
        const id = navigator.geolocation.watchPosition(
            pos => setGpsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            err => setGpsError(err.message),
            { enableHighAccuracy: true, maximumAge: 2000 }
        );
        return () => navigator.geolocation.clearWatch(id);
    }, []);

    // ── Phone Compass (direct) ────────────────────────────────
    // compassHeading = the direction the phone is physically pointing, in degrees
    // (0 = North, 90 = East, 180 = South, 270 = West)
    const [compassHeading, setCompassHeading] = useState(0);
    const compassRef = useRef(0);

    useEffect(() => {
        const ALPHA = 0.2; // light smoothing — lower = smoother but more lag

        const applyHeading = (raw) => {
            // Circular low-pass filter (handles 0°/360° wraparound)
            const prev = compassRef.current;
            let diff = raw - prev;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            const next = ((prev + ALPHA * diff) % 360 + 360) % 360;
            compassRef.current = next;
            setCompassHeading(next);
        };

        const onOrientation = (e) => {
            if (e.webkitCompassHeading != null) {
                // iOS Safari — direct compass bearing, always correct
                applyHeading(e.webkitCompassHeading);
            } else if (e.alpha != null) {
                // Android — alpha is device rotation from north
                applyHeading((360 - e.alpha) % 360);
            }
        };

        // Listen to both — deviceorientationabsolute is Android Chrome (calibrated),
        // deviceorientation is the fallback (works on iOS + some Android)
        window.addEventListener('deviceorientationabsolute', onOrientation, true);
        window.addEventListener('deviceorientation', onOrientation, true);

        return () => {
            window.removeEventListener('deviceorientationabsolute', onOrientation, true);
            window.removeEventListener('deviceorientation', onOrientation, true);
        };
    }, []);

    // ── Admin-saved locations (from localStorage) ─────────────
    const [adminLocations, setAdminLocations] = useState(() => loadLocCoords());

    // Reload when returning to home screen (in case admin saved new locations)
    useEffect(() => {
        if (currentScreen === 'home') {
            setAdminLocations(loadLocCoords());
        }
    }, [currentScreen]);

    // ── Walkable graph ────────────────────────────────────────
    const [segments, setSegments] = useState([]);
    const [walkGraph, setWalkGraph] = useState({ nodes: [], nodeMap: {}, adjacency: {} });

    useEffect(() => {
        const segs = loadSegments();
        setSegments(segs);
        setWalkGraph(buildGraphFromSegments(segs));
    }, []);

    // Reload graph when returning to home (admin may have updated)
    useEffect(() => {
        if (currentScreen === 'home') {
            const segs = loadSegments();
            setSegments(segs);
            setWalkGraph(buildGraphFromSegments(segs));
        }
    }, [currentScreen]);

    const refreshGraph = useCallback((segs) => {
        setSegments(segs);
        setWalkGraph(buildGraphFromSegments(segs));
    }, []);

    // ── Navigation ────────────────────────────────────────────
    const [destNodeId, setDestNodeId] = useState(null);
    const [adminDest, setAdminDest] = useState(null);  // { name, lat, lng }
    const [path, setPath] = useState([]);
    const [waypointIdx, setWaypointIdx] = useState(0);
    const [arrived, setArrived] = useState(false);
    const [isOffTrack, setIsOffTrack] = useState(false);
    const [offTrackDist, setOffTrackDist] = useState(0);
    const [directionInstruction, setDirectionInstruction] = useState('');

    // Snap-to-track state
    const [snappedPos, setSnappedPos] = useState(null);  // { lat, lng } on the route
    const [guideLineTarget, setGuideLineTarget] = useState(null);  // { lat, lng } nearest track point when far

    // Select admin destination → navigate to map
    const selectAdminDestination = useCallback((name, lat, lng) => {
        setAdminDest({ name, lat, lng });
        setDestNodeId(null);  // Clear old campus-node destination
        setArrived(false);
        setIsOffTrack(false);
        navigate('map');
    }, [navigate]);

    // Legacy: select campusData destination
    const selectDestination = useCallback((nodeId) => {
        setDestNodeId(nodeId);
        setAdminDest(null);
        setArrived(false);
        setIsOffTrack(false);
        navigate('map');
    }, [navigate]);

    const clearDestination = useCallback(() => {
        setDestNodeId(null);
        setAdminDest(null);
        setPath([]);
        setArrived(false);
        setIsOffTrack(false);
        setDirectionInstruction('');
        prevBearingRef.current = null;
        goBack();
    }, [goBack]);

    // ── Compute A* path ────────────────────────────────────────
    useEffect(() => {
        if (walkGraph.nodes.length === 0 || !gpsPos) {
            setPath([]); return;
        }

        // Determine destination lat/lng
        let destLat, destLng;
        if (adminDest) {
            destLat = adminDest.lat;
            destLng = adminDest.lng;
        } else if (destNodeId) {
            const destCampusNode = campusNodeMap[destNodeId];
            if (!destCampusNode) { setPath([]); return; }
            destLat = destCampusNode.lat;
            destLng = destCampusNode.lng;
        } else {
            setPath([]); return;
        }

        // Find nearest walkable nodes
        const startWN = nearestWalkableNode(gpsPos.lat, gpsPos.lng, null, walkGraph.nodes);
        const destWN = nearestWalkableNode(destLat, destLng, null, walkGraph.nodes);
        if (!startWN || !destWN) { setPath([]); return; }

        const result = aStarOnGraph(startWN.id, destWN.id, walkGraph.adjacency, walkGraph.nodeMap);
        setPath(result || []);
        setWaypointIdx(0);
        setArrived(false);
    }, [destNodeId, adminDest, gpsPos, walkGraph]);

    // ── Snap to track + advance waypoints + direction ───────────
    useEffect(() => {
        if (!gpsPos || path.length === 0) {
            setSnappedPos(null);
            setGuideLineTarget(null);
            return;
        }

        // Project GPS onto the nearest point on the route polyline
        const snap = snapToPath(gpsPos.lat, gpsPos.lng, path, walkGraph.nodeMap);

        if (snap.dist <= SNAP_DIST) {
            // Close enough — snap user dot onto the track
            setSnappedPos({ lat: snap.lat, lng: snap.lng });
            setGuideLineTarget(null);
            setIsOffTrack(false);
            setOffTrackDist(0);
        } else {
            // Too far — show real GPS and a guideline to nearest track point
            setSnappedPos(null);
            setGuideLineTarget({ lat: snap.lat, lng: snap.lng });
            setIsOffTrack(true);
            setOffTrackDist(Math.round(snap.dist));
        }

        // Use snapped position (if available) for waypoint advancement
        const effectiveLat = snap.dist <= SNAP_DIST ? snap.lat : gpsPos.lat;
        const effectiveLng = snap.dist <= SNAP_DIST ? snap.lng : gpsPos.lng;

        const target = walkGraph.nodeMap[path[waypointIdx]];
        if (!target) return;
        const d = haversineMetres(effectiveLat, effectiveLng, target.lat, target.lng);


        if (d < 8) {
            // Vibrate on waypoint arrival
            if (navigator.vibrate) navigator.vibrate(200);

            if (waypointIdx < path.length - 1) {
                const nextNode = walkGraph.nodeMap[path[waypointIdx + 1]];
                if (nextNode && nextNode.floor !== currentFloor) setCurrentFloor(nextNode.floor);
                setWaypointIdx(w => w + 1);
            } else {
                setArrived(true);
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
        }
    }, [gpsPos]);

    // ── Direction instruction (live — updates on compass AND GPS changes) ──
    // This mirrors Google Maps: the "turn left/right" banner refreshes every time
    // the user rotates their phone, not just when GPS ticks.
    useEffect(() => {
        if (!gpsPos || path.length === 0) {
            setDirectionInstruction('');
            return;
        }
        const target = walkGraph.nodeMap[path[waypointIdx]];
        if (!target) return;
        // Prefer snapped position for bearing accuracy
        const fromLat = snappedPos ? snappedPos.lat : gpsPos.lat;
        const fromLng = snappedPos ? snappedPos.lng : gpsPos.lng;
        const br = bearing(fromLat, fromLng, target.lat, target.lng);
        setDirectionInstruction(getDirectionFromHeading(compassHeading, br));
    }, [compassHeading, gpsPos, snappedPos, path, waypointIdx, walkGraph]);

    // ── AR values ─────────────────────────────────────────────
    const arrowAngle = useCallback(() => {
        if (!gpsPos || path.length === 0) return 0;
        const target = walkGraph.nodeMap[path[waypointIdx]];
        if (!target) return 0;
        // Use snapped position for bearing if available
        const fromLat = snappedPos ? snappedPos.lat : gpsPos.lat;
        const fromLng = snappedPos ? snappedPos.lng : gpsPos.lng;
        const wb = bearing(fromLat, fromLng, target.lat, target.lng);
        // Subtract phone heading so arrow rotates relative to where phone is pointing
        return (wb - compassHeading + 360) % 360;
    }, [gpsPos, snappedPos, path, waypointIdx, walkGraph, compassHeading]);

    const distanceToDest = useCallback(() => {
        if (!gpsPos) return null;
        if (adminDest) {
            return Math.round(haversineMetres(gpsPos.lat, gpsPos.lng, adminDest.lat, adminDest.lng));
        }
        if (destNodeId) {
            const dest = campusNodeMap[destNodeId];
            return dest ? Math.round(haversineMetres(gpsPos.lat, gpsPos.lng, dest.lat, dest.lng)) : null;
        }
        return null;
    }, [gpsPos, destNodeId, adminDest]);

    const distanceToNextWaypoint = useCallback(() => {
        if (!gpsPos || path.length === 0) return null;
        const target = walkGraph.nodeMap[path[waypointIdx]];
        if (!target) return null;
        return Math.round(haversineMetres(gpsPos.lat, gpsPos.lng, target.lat, target.lng));
    }, [gpsPos, path, waypointIdx, walkGraph]);

    // Current destination name (works for both admin and campus)
    const destName = adminDest ? adminDest.name : (destNodeId ? campusNodeMap[destNodeId]?.name : null);
    const destIcon = adminDest ? '📍' : (destNodeId ? campusNodeMap[destNodeId]?.icon : null);

    const value = {
        // Navigation
        currentScreen, screenStack,
        navigate, goBack,
        // Floor
        currentFloor, selectFloor, changeFloor,
        // GPS
        gpsPos, gpsError,
        // Destinations (legacy campus nodes)
        destNodeId, selectDestination, clearDestination, setArrived,
        nodeMap: campusNodeMap, selectableNodes,
        // Admin destinations
        adminDest, adminLocations, selectAdminDestination,
        // Route info
        destName, destIcon,
        // Path
        path, waypointIdx, arrived,
        // Snap-to-track
        snappedPos, guideLineTarget,
        // Off-track
        isOffTrack, offTrackDist,
        // Direction
        directionInstruction,
        // Compass / AR — direct phone heading
        compassHeading,
        arrowAngle, distanceToDest, distanceToNextWaypoint,
        // Walkable graph
        walkGraph, segments, refreshGraph,
    };

    return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export const useNav = () => useContext(NavCtx);