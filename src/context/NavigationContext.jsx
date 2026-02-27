import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { nodes as campusNodes, nodeMap as campusNodeMap, selectableNodes } from '../data/campusData.js';
import { haversineMetres, bearing } from '../utils/pathfinder.js';
import { loadSegments, buildGraphFromSegments, MERGE_DIST } from '../utils/walkablePaths.js';

const NavCtx = createContext(null);

/** A* over a given adjacency map and nodeMap — works on any graph */
function aStarOnGraph(startId, goalId, adjacency, nodeMap) {
    if (startId === goalId) return [startId];
    const goalNode = nodeMap[goalId];
    if (!goalNode) return null;
    const h = id => {
        const n = nodeMap[id];
        return n ? haversineMetres(n.lat, n.lng, goalNode.lat, goalNode.lng) : Infinity;
    };
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

/** Find the nearest walkable-graph node on `floor` to (lat, lng) */
function nearestWalkableNode(lat, lng, floor, graphNodes) {
    let best = null, bestDist = Infinity;
    for (const n of graphNodes) {
        if (n.floor !== floor) continue;
        const d = haversineMetres(lat, lng, n.lat, n.lng);
        if (d < bestDist) { bestDist = d; best = n; }
    }
    return best;
}

/** Find the nearest campus room node (for destination snapping) on the walkable graph */
function snapDestToGraph(destNode, graphNodes) {
    // First try to find an exact label match
    for (const n of graphNodes) {
        if (n.label && destNode.name && n.label.includes(destNode.name.split('–')[0].trim())) return n;
    }
    // Fall back to nearest node on same floor
    return nearestWalkableNode(destNode.lat, destNode.lng, destNode.floor, graphNodes);
}

export function NavigationProvider({ children }) {
    // ── Floor selection ──
    const [currentFloor, setCurrentFloor] = useState(null);
    const [viewMode, setViewMode] = useState('map');    // 'ar' | 'map' | 'admin'

    // ── GPS ──
    const [gpsPos, setGpsPos] = useState(null);
    const [gpsError, setGpsError] = useState(null);

    // ── Walkable graph (rebuilt whenever segments change) ──
    const [segments, setSegments] = useState([]);
    const [walkGraph, setWalkGraph] = useState({ nodes: [], nodeMap: {}, adjacency: {} });

    // ── Navigation ──
    const [destNodeId, setDestNodeId] = useState(null);   // campus room id
    const [path, setPath] = useState([]);                  // walkable-graph node ids
    const [waypointIdx, setWaypointIdx] = useState(0);
    const [arrived, setArrived] = useState(false);

    // ── Compass ──
    const [compassHeading, setCompassHeading] = useState(0);

    // ── Load segments & build graph on mount ──
    useEffect(() => {
        const segs = loadSegments();
        setSegments(segs);
        setWalkGraph(buildGraphFromSegments(segs));
    }, []);

    // ── Rebuild graph when segments change ──
    const refreshGraph = useCallback((segs) => {
        setSegments(segs);
        setWalkGraph(buildGraphFromSegments(segs));
    }, []);

    // ── GPS watch ──
    useEffect(() => {
        if (!navigator.geolocation) { setGpsError('Geolocation not supported'); return; }
        const id = navigator.geolocation.watchPosition(
            pos => setGpsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            err => setGpsError(err.message),
            { enableHighAccuracy: true, maximumAge: 2000 }
        );
        return () => navigator.geolocation.clearWatch(id);
    }, []);

    // ── Compass ──
    useEffect(() => {
        const handler = e => {
            const h = e.webkitCompassHeading != null ? e.webkitCompassHeading : (360 - (e.alpha || 0)) % 360;
            setCompassHeading(h);
        };
        window.addEventListener('deviceorientation', handler, true);
        return () => window.removeEventListener('deviceorientation', handler, true);
    }, []);

    // ── Compute path on walkable graph ──
    useEffect(() => {
        if (!destNodeId || !gpsPos || !currentFloor || walkGraph.nodes.length === 0) {
            setPath([]); return;
        }
        const destCampusNode = campusNodeMap[destNodeId];
        if (!destCampusNode) return;

        // Snap user position → nearest walkable node on current floor
        const startWN = nearestWalkableNode(gpsPos.lat, gpsPos.lng, currentFloor, walkGraph.nodes);
        // Snap destination → nearest walkable node
        const destWN = snapDestToGraph(destCampusNode, walkGraph.nodes);
        if (!startWN || !destWN) { setPath([]); return; }

        const result = aStarOnGraph(startWN.id, destWN.id, walkGraph.adjacency, walkGraph.nodeMap);
        setPath(result || []);
        setWaypointIdx(0);
        setArrived(false);
    }, [destNodeId, gpsPos, currentFloor, walkGraph]);

    // ── Advance waypoints ──
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

    // ── AR values ──
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
        currentFloor, setCurrentFloor,
        viewMode, setViewMode,
        gpsPos, gpsError,
        destNodeId, setDestNodeId,
        path, waypointIdx,
        arrived, setArrived,
        compassHeading,
        arrowAngle,
        distanceToDest,
        // campus room nodes for destination selector:
        nodeMap: campusNodeMap, selectableNodes,
        // walkable graph (for map drawing):
        walkGraph, segments, refreshGraph,
    };

    return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export const useNav = () => useContext(NavCtx);
