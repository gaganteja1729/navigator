import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { nodes as campusNodes, nodeMap as campusNodeMap, selectableNodes } from '../data/campusData.js';
import { haversineMetres, bearing } from '../utils/pathfinder.js';
import { loadSegments, buildGraphFromSegments } from '../utils/walkablePaths.js';

const NavCtx = createContext(null);

/** Screens and their hierarchy:
 *  floor-select → home → map → ar
 *                       → admin
 */

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
        if (n.floor !== floor) continue;
        const d = haversineMetres(lat, lng, n.lat, n.lng);
        if (d < bestDist) { bestDist = d; best = n; }
    }
    return best;
}

function snapDestToGraph(destNode, graphNodes) {
    for (const n of graphNodes) {
        if (n.label && destNode.name && n.label.includes(destNode.name.split('–')[0].trim())) return n;
    }
    return nearestWalkableNode(destNode.lat, destNode.lng, destNode.floor, graphNodes);
}

export function NavigationProvider({ children }) {
    // ── Screen history stack ──────────────────────────────────
    // Screens: 'floor-select' | 'home' | 'map' | 'ar' | 'admin'
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
        // Replace floor-select with home (don't allow back to floor-select from home)
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

    // ── Walkable graph ────────────────────────────────────────
    const [segments, setSegments] = useState([]);
    const [walkGraph, setWalkGraph] = useState({ nodes: [], nodeMap: {}, adjacency: {} });

    useEffect(() => {
        const segs = loadSegments();
        setSegments(segs);
        setWalkGraph(buildGraphFromSegments(segs));
    }, []);

    const refreshGraph = useCallback((segs) => {
        setSegments(segs);
        setWalkGraph(buildGraphFromSegments(segs));
    }, []);

    // ── Navigation ────────────────────────────────────────────
    const [destNodeId, setDestNodeId] = useState(null);
    const [path, setPath] = useState([]);
    const [waypointIdx, setWaypointIdx] = useState(0);
    const [arrived, setArrived] = useState(false);

    // Select destination → automatically navigate to map screen
    const selectDestination = useCallback((nodeId) => {
        setDestNodeId(nodeId);
        setArrived(false);
        navigate('map');
    }, [navigate]);

    // Clear destination → go back
    const clearDestination = useCallback(() => {
        setDestNodeId(null);
        setPath([]);
        setArrived(false);
        goBack();
    }, [goBack]);

    // ── Compute A* path ────────────────────────────────────────
    useEffect(() => {
        if (!destNodeId || !gpsPos || !currentFloor || walkGraph.nodes.length === 0) {
            setPath([]); return;
        }
        const destCampusNode = campusNodeMap[destNodeId];
        if (!destCampusNode) return;
        const startWN = nearestWalkableNode(gpsPos.lat, gpsPos.lng, currentFloor, walkGraph.nodes);
        const destWN = snapDestToGraph(destCampusNode, walkGraph.nodes);
        if (!startWN || !destWN) { setPath([]); return; }
        const result = aStarOnGraph(startWN.id, destWN.id, walkGraph.adjacency, walkGraph.nodeMap);
        setPath(result || []);
        setWaypointIdx(0);
        setArrived(false);
    }, [destNodeId, gpsPos, currentFloor, walkGraph]);

    // ── Advance waypoints ─────────────────────────────────────
    useEffect(() => {
        if (!gpsPos || path.length === 0) return;
        const target = walkGraph.nodeMap[path[waypointIdx]];
        if (!target) return;
        const d = haversineMetres(gpsPos.lat, gpsPos.lng, target.lat, target.lng);
        if (d < 5) {
            if (waypointIdx < path.length - 1) {
                const nextNode = walkGraph.nodeMap[path[waypointIdx + 1]];
                if (nextNode && nextNode.floor !== currentFloor) setCurrentFloor(nextNode.floor);
                setWaypointIdx(w => w + 1);
            } else {
                setArrived(true);
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
        if (!gpsPos || !destNodeId) return null;
        const dest = campusNodeMap[destNodeId];
        return dest ? Math.round(haversineMetres(gpsPos.lat, gpsPos.lng, dest.lat, dest.lng)) : null;
    }, [gpsPos, destNodeId]);

    const value = {
        // Navigation
        currentScreen, screenStack,
        navigate, goBack,
        // Floor
        currentFloor, selectFloor, changeFloor,
        // GPS
        gpsPos, gpsError,
        // Destinations
        destNodeId, selectDestination, clearDestination, setArrived,
        nodeMap: campusNodeMap, selectableNodes,
        // Path
        path, waypointIdx, arrived,
        // Compass / AR
        compassHeading, arrowAngle, distanceToDest,
        // Walkable graph
        walkGraph, segments, refreshGraph,
    };

    return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export const useNav = () => useContext(NavCtx);
