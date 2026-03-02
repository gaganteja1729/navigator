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
        if (d < bestDist) { bestDist = d; best = n; bestDist = d; }
    }
    return { node: best, dist: bestDist };
}

// ── Direction instruction from bearing change ─────────────────
function getDirectionInstruction(prevBearing, currentBearing) {
    let diff = ((currentBearing - prevBearing) + 360) % 360;
    if (diff > 180) diff -= 360;
    if (Math.abs(diff) < 20) return '⬆️ Go straight';
    if (diff >= 20 && diff < 70) return '↗️ Slight right';
    if (diff >= 70 && diff < 120) return '➡️ Turn right';
    if (diff >= 120) return '↩️ Sharp right';
    if (diff <= -20 && diff > -70) return '↖️ Slight left';
    if (diff <= -70 && diff > -120) return '⬅️ Turn left';
    if (diff <= -120) return '↩️ Sharp left';
    return '⬆️ Go straight';
}

const OFF_TRACK_DIST = 15; // metres

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

    // ── Compass ──────────────────────────────────────────────
    const [compassHeading, setCompassHeading] = useState(0);
    useEffect(() => {
        const handler = e => {
            const h = e.webkitCompassHeading != null ? e.webkitCompassHeading : (360 - (e.alpha || 0)) % 360;
            setCompassHeading(h);
        };
        window.addEventListener('deviceorientation', handler, true);
        return () => window.removeEventListener('deviceorientation', handler, true);
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
    const prevBearingRef = useRef(null);

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

    // ── Advance waypoints + off-track + direction ──────────────
    useEffect(() => {
        if (!gpsPos || path.length === 0) return;

        // Off-track detection
        const { dist: nearestDist } = nearestNodeOnPath(gpsPos.lat, gpsPos.lng, path, walkGraph.nodeMap);
        setIsOffTrack(nearestDist > OFF_TRACK_DIST);
        setOffTrackDist(Math.round(nearestDist));

        const target = walkGraph.nodeMap[path[waypointIdx]];
        if (!target) return;
        const d = haversineMetres(gpsPos.lat, gpsPos.lng, target.lat, target.lng);

        // Direction instruction
        const currentBr = bearing(gpsPos.lat, gpsPos.lng, target.lat, target.lng);
        if (prevBearingRef.current !== null) {
            setDirectionInstruction(getDirectionInstruction(prevBearingRef.current, currentBr));
        } else {
            setDirectionInstruction('⬆️ Go straight');
        }

        if (d < 5) {
            // Vibrate on waypoint arrival
            if (navigator.vibrate) navigator.vibrate(200);

            if (waypointIdx < path.length - 1) {
                const nextNode = walkGraph.nodeMap[path[waypointIdx + 1]];
                if (nextNode && nextNode.floor !== currentFloor) setCurrentFloor(nextNode.floor);
                prevBearingRef.current = currentBr;
                setWaypointIdx(w => w + 1);
            } else {
                setArrived(true);
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gpsPos]);

    // ── AR values ─────────────────────────────────────────────
    const arrowAngle = useCallback(() => {
        if (!gpsPos || path.length === 0) return 0;
        const target = walkGraph.nodeMap[path[waypointIdx]];
        if (!target) return 0;
        const wb = bearing(gpsPos.lat, gpsPos.lng, target.lat, target.lng);
        return (wb - compassHeading + 360) % 360;
    }, [gpsPos, path, waypointIdx, walkGraph, compassHeading]);

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
        // Off-track
        isOffTrack, offTrackDist,
        // Direction
        directionInstruction,
        // Compass / AR
        compassHeading, arrowAngle, distanceToDest, distanceToNextWaypoint,
        // Walkable graph
        walkGraph, segments, refreshGraph,
    };

    return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export const useNav = () => useContext(NavCtx);