import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { nodes, nodeMap, selectableNodes } from '../data/campusData.js';
import { aStar, bearing, haversineMetres } from '../utils/pathfinder.js';

const NavCtx = createContext(null);

export function NavigationProvider({ children }) {
    // ── Floor selection ──────────────────────────────────────
    const [currentFloor, setCurrentFloor] = useState(null);   // null = not yet chosen
    const [viewMode, setViewMode] = useState('map');           // 'ar' | 'map'

    // ── GPS position ─────────────────────────────────────────
    const [gpsPos, setGpsPos] = useState(null);  // { lat, lng, accuracy }
    const [gpsError, setGpsError] = useState(null);

    // ── Navigation state ─────────────────────────────────────
    const [startNodeId, setStartNodeId] = useState(null);
    const [destNodeId, setDestNodeId] = useState(null);
    const [path, setPath] = useState([]);           // array of node ids
    const [waypointIdx, setWaypointIdx] = useState(0);
    const [arrived, setArrived] = useState(false);

    // ── Compass heading ──────────────────────────────────────
    const [compassHeading, setCompassHeading] = useState(0);

    // ── Start GPS watch ──────────────────────────────────────
    useEffect(() => {
        if (!navigator.geolocation) {
            setGpsError('Geolocation not supported');
            return;
        }
        const id = navigator.geolocation.watchPosition(
            pos => {
                setGpsPos({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                });
            },
            err => setGpsError(err.message),
            { enableHighAccuracy: true, maximumAge: 2000 }
        );
        return () => navigator.geolocation.clearWatch(id);
    }, []);

    // ── Auto-snap start node when GPS updates ────────────────
    useEffect(() => {
        if (!gpsPos || !currentFloor) return;
        // Find nearest node on current floor
        let best = null, bestDist = Infinity;
        for (const n of nodes) {
            if (n.floor !== currentFloor) continue;
            const d = haversineMetres(gpsPos.lat, gpsPos.lng, n.lat, n.lng);
            if (d < bestDist) { bestDist = d; best = n; }
        }
        if (best) setStartNodeId(best.id);
    }, [gpsPos, currentFloor]);

    // ── Listen to compass ────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            // iOS: webkitCompassHeading  |  Android: 360 - alpha
            const h = e.webkitCompassHeading != null
                ? e.webkitCompassHeading
                : (360 - (e.alpha || 0)) % 360;
            setCompassHeading(h);
        };
        window.addEventListener('deviceorientation', handler, true);
        return () => window.removeEventListener('deviceorientation', handler, true);
    }, []);

    // ── Compute path whenever start or dest changes ──────────
    useEffect(() => {
        if (!startNodeId || !destNodeId) { setPath([]); return; }
        const result = aStar(startNodeId, destNodeId);
        setPath(result || []);
        setWaypointIdx(0);
        setArrived(false);
    }, [startNodeId, destNodeId]);

    // ── Advance waypoint when user is close enough ───────────
    useEffect(() => {
        if (!gpsPos || path.length === 0) return;
        const target = nodeMap[path[waypointIdx]];
        if (!target) return;
        const d = haversineMetres(gpsPos.lat, gpsPos.lng, target.lat, target.lng);
        if (d < 5) {  // within 5 metres → advance
            if (waypointIdx < path.length - 1) {
                setWaypointIdx(w => w + 1);
                // Auto-switch floor if staircase crossed
                const next = nodeMap[path[waypointIdx + 1]];
                if (next && next.floor !== currentFloor) setCurrentFloor(next.floor);
            } else {
                setArrived(true);
            }
        }
    }, [gpsPos]);

    // ── Bearing to current waypoint ──────────────────────────
    const waypointBearing = useCallback(() => {
        if (!gpsPos || path.length === 0) return null;
        const target = nodeMap[path[waypointIdx]];
        if (!target) return null;
        return bearing(gpsPos.lat, gpsPos.lng, target.lat, target.lng);
    }, [gpsPos, path, waypointIdx]);

    // ── AR arrow rotation ─────────────────────────────────────
    // Angle the arrow should point on screen (0 = up = forward)
    const arrowAngle = useCallback(() => {
        const wb = waypointBearing();
        if (wb === null) return 0;
        return (wb - compassHeading + 360) % 360;
    }, [waypointBearing, compassHeading]);

    // ── Distance to destination ───────────────────────────────
    const distanceToDest = useCallback(() => {
        if (!gpsPos || !destNodeId) return null;
        const dest = nodeMap[destNodeId];
        return Math.round(haversineMetres(gpsPos.lat, gpsPos.lng, dest.lat, dest.lng));
    }, [gpsPos, destNodeId]);

    const value = {
        currentFloor, setCurrentFloor,
        viewMode, setViewMode,
        gpsPos, gpsError,
        startNodeId, setStartNodeId,
        destNodeId, setDestNodeId,
        path, waypointIdx,
        arrived, setArrived,
        compassHeading,
        arrowAngle,
        distanceToDest,
        nodeMap, selectableNodes,
    };

    return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export const useNav = () => useContext(NavCtx);
