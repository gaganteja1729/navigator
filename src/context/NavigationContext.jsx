import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { nodes as campusNodes, nodeMap as campusNodeMap, selectableNodes } from '../data/campusData.js';
import { haversineMetres, bearing } from '../utils/pathfinder.js';
import { loadSegments, loadLocCoords, buildGraphFromSegments } from '../utils/walkablePaths.js';

const NavCtx = createContext(null);

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
    const gpsPosRef = useRef(null);  // always up-to-date, does NOT trigger effects

    useEffect(() => {
        if (!navigator.geolocation) { setGpsError('Geolocation not supported'); return; }
        const id = navigator.geolocation.watchPosition(
            pos => {
                const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
                gpsPosRef.current = p;
                setGpsPos(p);
            },
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
        const ALPHA = 0.15;
        let gotAbsolute = false;  // true once a real absolute event fires

        const applyHeading = (raw) => {
            const prev = compassRef.current;
            let diff = raw - prev;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            const next = ((prev + ALPHA * diff) % 360 + 360) % 360;
            compassRef.current = next;
            setCompassHeading(next);
        };

        // ── Absolute handler (Android Chrome deviceorientationabsolute) ──
        // alpha = device counter-clockwise rotation from North → compass = 360 - alpha
        const onAbsolute = (e) => {
            if (e.alpha == null) return;
            gotAbsolute = true;
            applyHeading((360 - e.alpha + 360) % 360);
        };

        // ── Relative handler (iOS Safari + Android fallback) ──
        const onRelative = (e) => {
            // If absolute events are available, ignore relative entirely
            if (gotAbsolute) return;

            if (e.webkitCompassHeading != null) {
                // iOS Safari — webkitCompassHeading is always a true compass bearing
                applyHeading(e.webkitCompassHeading);
            } else if (e.alpha != null) {
                // Last-resort fallback — may be relative, but better than nothing
                applyHeading((360 - e.alpha + 360) % 360);
            }
        };

        window.addEventListener('deviceorientationabsolute', onAbsolute, true);
        window.addEventListener('deviceorientation', onRelative, true);

        return () => {
            window.removeEventListener('deviceorientationabsolute', onAbsolute, true);
            window.removeEventListener('deviceorientation', onRelative, true);
        };
    }, []);
    // ── Admin-saved locations (from server storage) ───────────
    const [adminLocations, setAdminLocations] = useState({});

    // ── Walkable graph ────────────────────────────────────────
    const [segments, setSegments] = useState([]);
    const [walkGraph, setWalkGraph] = useState({ nodes: [], nodeMap: {}, adjacency: {} });

    useEffect(() => {
        let isActive = true;
        (async () => {
            const [segs, locs] = await Promise.all([loadSegments(), loadLocCoords()]);
            if (!isActive) return;
            setSegments(segs);
            setWalkGraph(buildGraphFromSegments(segs));
            setAdminLocations(locs);
        })();
        return () => { isActive = false; };
    }, []);

    // Reload graph when returning to home (admin may have updated)
    useEffect(() => {
        if (currentScreen !== 'home') return;
        let isActive = true;
        (async () => {
            const [segs, locs] = await Promise.all([loadSegments(), loadLocCoords()]);
            if (!isActive) return;
            setSegments(segs);
            setWalkGraph(buildGraphFromSegments(segs));
            setAdminLocations(locs);
        })();
        return () => { isActive = false; };
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
    const selectAdminDestination = useCallback((name, lat, lng, floor = 'ground') => {
        setAdminDest({ name, lat, lng, floor });
        setDestNodeId(null);
        setArrived(false);
        setIsOffTrack(false);
        setCrossFloorPending(false);
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

    // ── Cross-floor state ─────────────────────────────────────
    const [crossFloorPending, setCrossFloorPending] = useState(false);
    const [pendingFloor, setPendingFloor] = useState(null);

    // User taps “I’m on the new floor”
    const confirmFloorChange = useCallback(() => {
        if (pendingFloor) setCurrentFloor(pendingFloor);
        setPendingFloor(null);
        setCrossFloorPending(false);
    }, [pendingFloor]);

    // ── Compute A* path ──────────────────────────────────────
    // NOTE: gpsPos intentionally NOT in deps — path recalculates only on dest/graph change.
    useEffect(() => {
        const pos = gpsPosRef.current;
        if (walkGraph.nodes.length === 0 || !pos) { setPath([]); return; }

        let destLat, destLng, destFlr;
        if (adminDest) {
            destLat = adminDest.lat; destLng = adminDest.lng; destFlr = adminDest.floor ?? 'ground';
        } else if (destNodeId) {
            const n = campusNodeMap[destNodeId];
            if (!n) { setPath([]); return; }
            destLat = n.lat; destLng = n.lng; destFlr = 'ground';
        } else { setPath([]); return; }

        // Find nearest walkable node on the USER’S current floor
        const startWN = nearestWalkableNode(pos.lat, pos.lng, currentFloor, walkGraph.nodes);
        // Find nearest walkable node on the DESTINATION’S floor
        const destWN = nearestWalkableNode(destLat, destLng, destFlr, walkGraph.nodes);
        if (!startWN || !destWN) { setPath([]); return; }

        const result = aStarOnGraph(startWN.id, destWN.id, walkGraph.adjacency, walkGraph.nodeMap);
        setPath(result || []);
        setWaypointIdx(0);
        setArrived(false);
        setCrossFloorPending(false);
    }, [destNodeId, adminDest, walkGraph, currentFloor]);  // currentFloor added


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
            // Check if this waypoint is a cross-floor transition
            const nextId = path[waypointIdx + 1];
            const nextNode = nextId ? walkGraph.nodeMap[nextId] : null;
            const isCrossFloor = nextNode && nextNode.floor !== target.floor;

            if (isCrossFloor && !crossFloorPending) {
                // Stop at stair node, wait for user to confirm floor change
                setCrossFloorPending(true);
                setPendingFloor(nextNode.floor);
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                return;  // Don't advance yet
            }

            if (navigator.vibrate) navigator.vibrate(150);
            if (waypointIdx < path.length - 1) {
                setWaypointIdx(w => w + 1);
            } else {
                setArrived(true);
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
        }
    }, [gpsPos]);

    // ── Direction instruction (live) ─────────────────────────
    useEffect(() => {
        if (!gpsPos || path.length === 0) { setDirectionInstruction(''); return; }

        const target = walkGraph.nodeMap[path[waypointIdx]];
        if (!target) return;

        // Cross-floor waypoint override
        if (crossFloorPending) {
            const nextNode = path[waypointIdx + 1] ? walkGraph.nodeMap[path[waypointIdx + 1]] : null;
            if (nextNode) {
                const goingUp = nextNode.floor === 'first';
                setDirectionInstruction(goingUp ? '🪴 Go upstairs' : '🪴 Go downstairs');
                return;
            }
        }
        if (target.label?.toLowerCase().includes('stair')) {
            const nextNode = path[waypointIdx + 1] ? walkGraph.nodeMap[path[waypointIdx + 1]] : null;
            if (nextNode && nextNode.floor !== target.floor) {
                setDirectionInstruction(nextNode.floor === 'first' ? '🪴 Head to stairs' : '🪴 Head to stairs (go down)');
                return;
            }
        }

        const fromLat = snappedPos ? snappedPos.lat : gpsPos.lat;
        const fromLng = snappedPos ? snappedPos.lng : gpsPos.lng;
        const br = bearing(fromLat, fromLng, target.lat, target.lng);
        setDirectionInstruction(getDirectionFromHeading(compassHeading, br));
    }, [compassHeading, gpsPos, snappedPos, path, waypointIdx, walkGraph, crossFloorPending]);

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
        currentScreen, screenStack, navigate, goBack,
        currentFloor, selectFloor, changeFloor,
        gpsPos, gpsError,
        destNodeId, selectDestination, clearDestination, setArrived,
        nodeMap: campusNodeMap, selectableNodes,
        adminDest, adminLocations, selectAdminDestination,
        destName, destIcon,
        path, waypointIdx, arrived,
        snappedPos, guideLineTarget,
        isOffTrack, offTrackDist,
        directionInstruction,
        // Cross-floor
        crossFloorPending, pendingFloor, confirmFloorChange,
        compassHeading,
        arrowAngle, distanceToDest, distanceToNextWaypoint,
        walkGraph, segments, refreshGraph,
    };

    return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export const useNav = () => useContext(NavCtx);