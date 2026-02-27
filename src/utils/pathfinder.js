import { nodes, nodeMap, adjacency } from '../data/campusData.js';

// ── Haversine distance (metres) between two lat/lng points ──
export function haversineMetres(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Bearing from point A → point B (degrees, 0=North, clockwise) ──
export function bearing(lat1, lng1, lat2, lng2) {
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
    const x =
        Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
        Math.sin((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.cos(dLng);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ── A* pathfinder ──────────────────────────────────────────
/**
 * Returns an ordered array of node ids from startId → goalId,
 * or null if no path exists.
 */
export function aStar(startId, goalId) {
    if (startId === goalId) return [startId];

    const goalNode = nodeMap[goalId];
    const h = (id) => {
        const n = nodeMap[id];
        return haversineMetres(n.lat, n.lng, goalNode.lat, goalNode.lng);
    };

    const open = new Set([startId]);
    const cameFrom = {};
    const gScore = { [startId]: 0 };
    const fScore = { [startId]: h(startId) };

    while (open.size > 0) {
        // Node with lowest fScore
        let current = null;
        let lowest = Infinity;
        for (const id of open) {
            const f = fScore[id] ?? Infinity;
            if (f < lowest) { lowest = f; current = id; }
        }
        if (current === goalId) return reconstructPath(cameFrom, current);

        open.delete(current);
        for (const { id: neighbour, weight } of (adjacency[current] || [])) {
            const tentativeG = (gScore[current] ?? Infinity) + weight;
            if (tentativeG < (gScore[neighbour] ?? Infinity)) {
                cameFrom[neighbour] = current;
                gScore[neighbour] = tentativeG;
                fScore[neighbour] = tentativeG + h(neighbour);
                open.add(neighbour);
            }
        }
    }
    return null; // no path
}

function reconstructPath(cameFrom, current) {
    const path = [current];
    while (cameFrom[current]) {
        current = cameFrom[current];
        path.unshift(current);
    }
    return path;
}

/**
 * Find the nearest node on the given floor to a lat/lng position.
 */
export function nearestNode(lat, lng, floor) {
    let best = null, bestDist = Infinity;
    for (const n of nodes) {
        if (n.floor !== floor) continue;
        const d = haversineMetres(lat, lng, n.lat, n.lng);
        if (d < bestDist) { bestDist = d; best = n; }
    }
    return best;
}
