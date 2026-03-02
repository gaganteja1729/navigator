import { useMemo } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import { haversineMetres } from '../utils/pathfinder.js';
import '../styles/FloorMap.css';

const W = 400, H = 480;
const SPAN_M = 120; // metres across the view
const M_PER_LAT = 111320;
const mPerLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function makeProjection(centerLat, centerLng) {
    const halfLatDeg = (SPAN_M / 2) / M_PER_LAT;
    const halfLngDeg = (SPAN_M / 2) / mPerLng(centerLat);
    const PAD = 30;
    const usableW = W - PAD * 2;
    const usableH = H - PAD * 2;

    return (lat, lng) => ({
        x: ((lng - (centerLng - halfLngDeg)) / (2 * halfLngDeg)) * usableW + PAD,
        y: (((centerLat + halfLatDeg) - lat) / (2 * halfLatDeg)) * usableH + PAD,
    });
}

export default function FloorMapView() {
    const {
        path, waypointIdx,
        destNodeId, clearDestination,
        nodeMap, navigate,
        gpsPos,
        walkGraph, segments,
        goBack,
        adminDest, adminLocations,
        destName, destIcon,
        isOffTrack, offTrackDist,
        distanceToDest, distanceToNextWaypoint,
        directionInstruction,
    } = useNav();

    // Determine map center: admin dest → user GPS → default
    const center = useMemo(() => {
        if (adminDest) return { lat: adminDest.lat, lng: adminDest.lng };
        if (gpsPos) return { lat: gpsPos.lat, lng: gpsPos.lng };
        return { lat: 17.38515, lng: 78.48665 };
    }, [adminDest, gpsPos]);

    const project = useMemo(() => makeProjection(center.lat, center.lng), [center]);

    // Draw all walkable segments
    const segLines = useMemo(() => {
        return segments.map(seg => {
            const s = project(seg.start.lat, seg.start.lng);
            const e = project(seg.end.lat, seg.end.lng);
            return { id: seg.id, sx: s.x, sy: s.y, ex: e.x, ey: e.y };
        });
    }, [segments, project]);

    // Admin location markers
    const adminMarkers = useMemo(() => {
        return Object.entries(adminLocations).map(([name, coords]) => {
            const p = project(coords.lat, coords.lng);
            const isDest = adminDest?.name === name;
            return { name, ...p, isDest };
        });
    }, [adminLocations, project, adminDest]);

    // Route path points
    const pathPoints = useMemo(() => {
        return path
            .map(id => walkGraph.nodeMap[id])
            .filter(Boolean)
            .map(n => project(n.lat, n.lng));
    }, [path, walkGraph, project]);

    const pathStr = pathPoints.map(p => `${p.x},${p.y}`).join(' ');
    const userDot = useMemo(() => gpsPos ? project(gpsPos.lat, gpsPos.lng) : null, [gpsPos, project]);

    const distance = distanceToDest();
    const nextDist = distanceToNextWaypoint();
    const nextNode = path[waypointIdx] ? walkGraph.nodeMap[path[waypointIdx]] : null;

    return (
        <div className="fm-root">
            {/* Header */}
            <div className="fm-header">
                <button className="fm-back-btn" onClick={goBack}>‹ Back</button>
                <h2 className="fm-title">🗺️ Campus Map</h2>
                <div style={{ width: 60 }} />
            </div>

            {/* Off-track banner */}
            {isOffTrack && (
                <div className="fm-offtrack-banner">
                    <span className="fm-offtrack-icon">⚠️</span>
                    <span>Off route ({offTrackDist}m away) — rerouting…</span>
                </div>
            )}

            {/* Direction instruction */}
            {directionInstruction && !isOffTrack && path.length > 0 && (
                <div className="fm-direction-banner">
                    <span className="fm-direction-text">{directionInstruction}</span>
                    {nextNode?.label && (
                        <span className="fm-direction-target">toward {nextNode.label}</span>
                    )}
                </div>
            )}

            {/* SVG Map */}
            <div className="fm-map-wrap">
                <svg viewBox={`0 0 ${W} ${H}`} className="fm-svg">
                    {/* Background */}
                    <rect x="0" y="0" width={W} height={H} fill="#09101e" rx="12" />

                    {/* Grid */}
                    {Array.from({ length: 9 }).map((_, i) => {
                        const x = 30 + (i + 1) * ((W - 60) / 10);
                        const y = 30 + (i + 1) * ((H - 60) / 10);
                        return (
                            <g key={i} opacity="0.06">
                                <line x1={x} y1={30} x2={x} y2={H - 30} stroke="#6366f1" strokeWidth="0.5" />
                                <line x1={30} y1={y} x2={W - 30} y2={y} stroke="#6366f1" strokeWidth="0.5" />
                            </g>
                        );
                    })}

                    {/* Border */}
                    <rect x="30" y="30" width={W - 60} height={H - 60}
                        fill="none" stroke="#1e2540" strokeWidth="1.5" rx="6" />

                    {/* Compass */}
                    <text x={W - 36} y={46} textAnchor="middle" fill="#6366f1" fontSize="11" fontWeight="bold">N</text>
                    <line x1={W - 36} y1={50} x2={W - 36} y2={62} stroke="#6366f1" strokeWidth="1.5" />

                    {/* Scale hint */}
                    <text x={32} y={H - 18} fill="#334" fontSize="8" fontFamily="monospace">
                        {SPAN_M}m span
                    </text>

                    {/* ── Walkable path segments ── */}
                    {segLines.map(seg => (
                        <line key={seg.id}
                            x1={seg.sx} y1={seg.sy} x2={seg.ex} y2={seg.ey}
                            stroke="#1e2d4a" strokeWidth="2.5" strokeLinecap="round"
                        />
                    ))}

                    {/* ── Route path ── */}
                    {pathStr && (
                        <polyline points={pathStr} fill="none" stroke="#6366f1"
                            strokeWidth="4" strokeDasharray="8 5" strokeLinecap="round"
                            className="fm-route-line" />
                    )}

                    {/* ── Admin location markers ── */}
                    {adminMarkers.map(m => {
                        const r = m.isDest ? 8 : 6;
                        const pinColor = m.isDest ? '#f59e0b' : '#fb923c';
                        const textColor = m.isDest ? '#fde68a' : '#fed7aa';
                        const shortName = m.name.length > 12 ? m.name.slice(0, 11) + '…' : m.name;
                        return (
                            <g key={m.name}>
                                {m.isDest && (
                                    <circle cx={m.x} cy={m.y} r="14" fill="rgba(245,158,11,.15)" className="fm-dest-pulse" />
                                )}
                                <rect
                                    x={m.x - r} y={m.y - r}
                                    width={r * 2} height={r * 2}
                                    fill={pinColor}
                                    stroke={m.isDest ? 'white' : '#1a0a00'}
                                    strokeWidth={m.isDest ? 1.5 : 1}
                                    transform={`rotate(45 ${m.x} ${m.y})`}
                                />
                                <text
                                    x={m.x} y={m.y - r - 6}
                                    textAnchor="middle"
                                    fill={textColor}
                                    fontSize={m.isDest ? 9 : 7}
                                    fontWeight={m.isDest ? 'bold' : 'normal'}
                                    fontFamily="Inter"
                                >
                                    {shortName}
                                </text>
                            </g>
                        );
                    })}

                    {/* Current waypoint pulse */}
                    {(() => {
                        const wn = walkGraph.nodeMap[path[waypointIdx]];
                        if (!wn) return null;
                        const p = project(wn.lat, wn.lng);
                        return (
                            <g>
                                <circle cx={p.x} cy={p.y} r="10" fill="none" stroke="#6366f1"
                                    strokeWidth="2" className="fm-waypoint-pulse" />
                                <circle cx={p.x} cy={p.y} r="4" fill="#818cf8" />
                            </g>
                        );
                    })()}

                    {/* User GPS dot */}
                    {userDot && (
                        <g>
                            <circle cx={userDot.x} cy={userDot.y} r="12" fill="#6366f1" opacity="0.2" className="fm-user-ripple" />
                            <circle cx={userDot.x} cy={userDot.y} r="6" fill="#818cf8" stroke="white" strokeWidth="1.5" />
                            <circle cx={userDot.x} cy={userDot.y} r="2.5" fill="white" />
                        </g>
                    )}

                    {/* Destination pin */}
                    {adminDest && (() => {
                        const p = project(adminDest.lat, adminDest.lng);
                        return <text x={p.x} y={p.y - 16} textAnchor="middle" fontSize="18">📍</text>;
                    })()}
                </svg>
            </div>

            {/* Bottom info + CTA */}
            {(adminDest || destNodeId) && (
                <div className="fm-bottom-panel">
                    {/* Route info strip */}
                    <div className="fm-route-info">
                        <div className="fm-info-item">
                            <span className="fm-info-label">Distance</span>
                            <span className="fm-info-value">{distance !== null ? `${distance}m` : '--'}</span>
                        </div>
                        <div className="fm-info-item">
                            <span className="fm-info-label">Next</span>
                            <span className="fm-info-value fm-info-value--small">{nextDist !== null ? `${nextDist}m` : '--'}</span>
                        </div>
                        <div className="fm-info-item">
                            <span className="fm-info-label">Waypoints</span>
                            <span className="fm-info-value">{waypointIdx + 1}/{path.length}</span>
                        </div>
                    </div>

                    <div className="fm-cta-row">
                        <div className="fm-dest-info">
                            <span className="fm-dest-label">Navigating to</span>
                            <span className="fm-dest-name">{destIcon} {destName}</span>
                        </div>
                        <button className="fm-ar-btn" onClick={() => navigate('ar')}>AR ↗</button>
                        <button className="fm-cancel-btn" onClick={clearDestination}>✕</button>
                    </div>
                </div>
            )}
        </div>
    );
}
