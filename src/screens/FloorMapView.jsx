import { useMemo } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import { nodes } from '../data/campusData.js';
import '../styles/FloorMap.css';

// SVG viewport dimensions
const W = 400;
const H = 520;

// Lat/lng bounds for the campus  (bounding box of all nodes + padding)
const LAT_MIN = 17.38495;
const LAT_MAX = 17.38535;
const LNG_MIN = 78.48645;
const LNG_MAX = 78.48680;

function project(lat, lng) {
    const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (W - 60) + 30;
    const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (H - 80) + 40;
    return { x, y };
}

// Draw approximate room blocks around each node
const ROOM_SIZE = 18;

export default function FloorMapView() {
    const {
        currentFloor, setCurrentFloor,
        path, waypointIdx,
        startNodeId, destNodeId,
        nodeMap, setViewMode,
        setDestNodeId,
        gpsPos,
    } = useNav();

    const floorNodes = useMemo(
        () => nodes.filter(n => n.floor === currentFloor),
        [currentFloor]
    );

    // Build SVG polyline for the path (only nodes on this floor + staircase)
    const pathPoints = useMemo(() => {
        return path
            .map(id => nodeMap[id])
            .filter(n => n && (n.floor === currentFloor || n.type === 'staircase'))
            .map(n => project(n.lat, n.lng));
    }, [path, currentFloor]);

    const pathStr = pathPoints.map(p => `${p.x},${p.y}`).join(' ');

    // User dot position from GPS
    const userDot = useMemo(() => {
        if (!gpsPos) return null;
        return project(gpsPos.lat, gpsPos.lng);
    }, [gpsPos]);

    return (
        <div className="fm-root">
            {/* Header */}
            <div className="fm-header">
                <h2 className="fm-title">🗺️ Campus Map</h2>
                <div className="fm-floor-tabs">
                    <button
                        className={`fm-tab ${currentFloor === 'ground' ? 'active' : ''}`}
                        onClick={() => setCurrentFloor('ground')}
                    >Ground</button>
                    <button
                        className={`fm-tab ${currentFloor === 'first' ? 'active' : ''}`}
                        onClick={() => setCurrentFloor('first')}
                    >1st Floor</button>
                </div>
            </div>

            {/* SVG Map */}
            <div className="fm-map-wrap">
                <svg viewBox={`0 0 ${W} ${H}`} className="fm-svg">
                    {/* Background */}
                    <rect x="0" y="0" width={W} height={H} fill="#0f1117" rx="12" />
                    {/* Floor outline */}
                    <rect x="20" y="30" width={W - 40} height={H - 60}
                        fill="#1a1e2e" stroke="#334" strokeWidth="2" rx="8" />

                    {/* Floor label */}
                    <text x={W / 2} y="22" textAnchor="middle" fill="#5566aa" fontSize="11" fontFamily="Inter">
                        {currentFloor === 'ground' ? 'Ground Floor' : 'First Floor'}
                    </text>

                    {/* Room blocks */}
                    {floorNodes.map(n => {
                        const { x, y } = project(n.lat, n.lng);
                        const isPath = path.includes(n.id);
                        const isDest = n.id === destNodeId;
                        const isStart = n.id === startNodeId;
                        return (
                            <g key={n.id}>
                                <rect
                                    x={x - ROOM_SIZE / 2}
                                    y={y - ROOM_SIZE / 2}
                                    width={ROOM_SIZE}
                                    height={ROOM_SIZE}
                                    rx="4"
                                    fill={isDest ? '#f59e0b' : isPath ? '#6366f1' : n.type === 'staircase' ? '#10b981' : '#1e2540'}
                                    stroke={isDest ? '#fbbf24' : isPath ? '#818cf8' : '#334'}
                                    strokeWidth={isDest || isStart ? 2 : 1}
                                    className={isDest ? 'fm-dest-rect' : ''}
                                />
                                <text x={x} y={y + ROOM_SIZE + 8} textAnchor="middle"
                                    fill={isDest ? '#fcd34d' : isPath ? '#a5b4fc' : '#8899bb'}
                                    fontSize="7" fontFamily="Inter">
                                    {n.name.length > 18 ? n.name.slice(0, 16) + '…' : n.name}
                                </text>
                            </g>
                        );
                    })}

                    {/* Route polyline */}
                    {pathStr && (
                        <>
                            <polyline
                                points={pathStr}
                                fill="none"
                                stroke="#6366f1"
                                strokeWidth="3"
                                strokeDasharray="6 4"
                                strokeLinecap="round"
                                className="fm-route-line"
                            />
                            <polyline points={pathStr} fill="none"
                                stroke="#818cf8" strokeWidth="1.5"
                                strokeDasharray="6 4" strokeLinecap="round"
                                opacity="0.4" />
                        </>
                    )}

                    {/* Visited waypoints: dimmed */}
                    {path.slice(0, waypointIdx).map(id => {
                        const n = nodeMap[id];
                        if (!n || n.floor !== currentFloor) return null;
                        const { x, y } = project(n.lat, n.lng);
                        return <circle key={id + '_v'} cx={x} cy={y} r="4" fill="#334" />;
                    })}

                    {/* Current waypoint target */}
                    {(() => {
                        const curr = nodeMap[path[waypointIdx]];
                        if (!curr || curr.floor !== currentFloor) return null;
                        const { x, y } = project(curr.lat, curr.lng);
                        return (
                            <circle cx={x} cy={y} r="7" fill="none"
                                stroke="#6366f1" strokeWidth="2" className="fm-waypoint-pulse" />
                        );
                    })()}

                    {/* User dot */}
                    {userDot && (
                        <g>
                            <circle cx={userDot.x} cy={userDot.y} r="9"
                                fill="#6366f1" opacity="0.25" className="fm-user-ripple" />
                            <circle cx={userDot.x} cy={userDot.y} r="5" fill="#818cf8" />
                            <circle cx={userDot.x} cy={userDot.y} r="2.5" fill="white" />
                        </g>
                    )}

                    {/* Destination pin */}
                    {destNodeId && (() => {
                        const d = nodeMap[destNodeId];
                        if (!d || d.floor !== currentFloor) return null;
                        const { x, y } = project(d.lat, d.lng);
                        return (
                            <text x={x} y={y - 14} textAnchor="middle" fontSize="16">📍</text>
                        );
                    })()}

                    {/* Staircase indicator */}
                    {floorNodes.filter(n => n.type === 'staircase').map(n => {
                        const { x, y } = project(n.lat, n.lng);
                        return (
                            <text key={n.id + '_sc'} x={x} y={y - 13}
                                textAnchor="middle" fontSize="13">🪜</text>
                        );
                    })}
                </svg>
            </div>

            {/* Start AR button */}
            {destNodeId && (
                <div className="fm-cta-row">
                    <div className="fm-dest-info">
                        <span className="fm-dest-label">Navigating to</span>
                        <span className="fm-dest-name">{nodeMap[destNodeId]?.name}</span>
                    </div>
                    <button className="fm-ar-btn" onClick={() => setViewMode('ar')}>
                        Launch AR ↗
                    </button>
                    <button className="fm-cancel-btn" onClick={() => setDestNodeId(null)}>✕</button>
                </div>
            )}
        </div>
    );
}
