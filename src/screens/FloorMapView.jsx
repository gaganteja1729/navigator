import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import { haversineMetres } from '../utils/pathfinder.js';
import '../styles/FloorMap.css';

const W = 400, H = 500;
const BASE_SPAN_M = 300; // 300m across = covers ~3 acres comfortably
const MIN_ZOOM = 0.4, MAX_ZOOM = 12;
const M_PER_LAT = 111320;
const mPerLng = lat => 111320 * Math.cos(lat * Math.PI / 180);

function makeProjection(cLat, cLng) {
    const hy = (BASE_SPAN_M / 2) / M_PER_LAT;
    const hx = (BASE_SPAN_M / 2) / mPerLng(cLat);
    return (lat, lng) => ({
        x: ((lng - (cLng - hx)) / (2 * hx)) * W,
        y: (((cLat + hy) - lat) / (2 * hy)) * H,
    });
}

export default function FloorMapView() {
    const {
        path, waypointIdx, destNodeId, clearDestination,
        nodeMap, navigate, gpsPos, walkGraph, segments,
        goBack, adminDest, adminLocations, destName, destIcon,
        isOffTrack, offTrackDist, distanceToDest, distanceToNextWaypoint,
        directionInstruction, snappedPos, guideLineTarget, compassHeading,
        currentFloor, changeFloor,
        crossFloorPending, pendingFloor, confirmFloorChange,
    } = useNav();

    // ── View state (zoom + pan + rotation) ──────────────────
    const [view, setView] = useState({ zoom: 1.2, panX: 0, panY: 0, rotation: 0 });
    const [popup, setPopup] = useState(null);
    const [followGps, setFollowGps] = useState(true);
    const [headingUp, setHeadingUp] = useState(false);

    const svgRef = useRef(null);
    const pointers = useRef(new Map());
    const lastPinchDist = useRef(null);
    const lastPinchAngle = useRef(null);
    const dragStartRef = useRef(null);
    const didDrag = useRef(false);

    // ── Heading-up: auto-rotate map to compass heading ────────
    useEffect(() => {
        if (!headingUp) return;
        setView(v => ({ ...v, rotation: compassHeading ?? 0 }));
    }, [headingUp, compassHeading]);

    // ── Map center — GPS or fallback ──────────────────────────
    const center = useMemo(() => {
        if (gpsPos) return { lat: gpsPos.lat, lng: gpsPos.lng };
        if (adminDest) return { lat: adminDest.lat, lng: adminDest.lng };
        return { lat: 16.9289, lng: 82.2305 };
    }, [gpsPos?.lat, gpsPos?.lng, adminDest]);

    const project = useMemo(() => makeProjection(center.lat, center.lng), [center.lat, center.lng]);

    // ── Follow GPS: keep user dot centered ───────────────────
    const userDot = useMemo(() => gpsPos ? project(gpsPos.lat, gpsPos.lng) : null, [gpsPos, project]);
    const snappedDot = useMemo(() => snappedPos ? project(snappedPos.lat, snappedPos.lng) : null, [snappedPos, project]);
    const displayDot = snappedDot || userDot;

    useEffect(() => {
        if (!followGps || !displayDot) return;
        setView(v => ({
            ...v,
            panX: W / 2 - displayDot.x * v.zoom,
            panY: H / 2 - displayDot.y * v.zoom,
        }));
    }, [displayDot?.x, displayDot?.y, followGps]);

    // ── Coord helpers (account for rotation) ─────────────────
    // Forward: base(bx,by) → SVG display(dx,dy)
    //   a = bx*zoom, by*zoom
    //   b = (a.x+panX-W/2, a.y+panY-H/2)
    //   c = rotate(-R, b)
    //   d = (c.x+W/2, c.y+H/2)
    // Inverse:
    const clientToBase = useCallback((clientX, clientY) => {
        const el = svgRef.current; if (!el) return null;
        const rect = el.getBoundingClientRect();
        const R = view.rotation * Math.PI / 180;
        let x = (clientX - rect.left) * (W / rect.width) - W / 2;
        let y = (clientY - rect.top) * (H / rect.height) - H / 2;
        // undo rotate(-R) → rotate(+R)
        const rx = x * Math.cos(R) - y * Math.sin(R);
        const ry = x * Math.sin(R) + y * Math.cos(R);
        // undo translate(-W/2+panX, -H/2+panY)
        return { x: (rx + W / 2 - view.panX) / view.zoom, y: (ry + H / 2 - view.panY) / view.zoom };
    }, [view]);

    const baseToClient = useCallback((bx, by) => {
        const el = svgRef.current; if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        const R = view.rotation * Math.PI / 180;
        const ax = bx * view.zoom + view.panX - W / 2;
        const ay = by * view.zoom + view.panY - H / 2;
        const cx = ax * Math.cos(-R) - ay * Math.sin(-R) + W / 2;
        const cy = ax * Math.sin(-R) + ay * Math.cos(-R) + H / 2;
        return { x: cx * (rect.width / W) + rect.left, y: cy * (rect.height / H) + rect.top };
    }, [view]);

    // ── Apply zoom toward a SVG point ─────────────────────────
    const applyZoom = useCallback((factor, svgX, svgY) => {
        setFollowGps(false);
        setView(v => {
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
            const af = newZoom / v.zoom;
            return { ...v, zoom: newZoom, panX: v.panX + (svgX - v.panX) * (1 - af), panY: v.panY + (svgY - v.panY) * (1 - af) };
        });
    }, []);

    // ── Pointer events ────────────────────────────────────────
    const onPointerDown = (e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        dragStartRef.current = { clientX: e.clientX, clientY: e.clientY };
        didDrag.current = false;
        if (pointers.current.size === 2) {
            const pts = [...pointers.current.values()];
            lastPinchDist.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            lastPinchAngle.current = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180 / Math.PI;
        }
    };

    const onPointerMove = (e) => {
        if (!pointers.current.has(e.pointerId)) return;
        const prev = pointers.current.get(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (Math.abs(e.clientX - dragStartRef.current?.clientX) > 4 ||
            Math.abs(e.clientY - dragStartRef.current?.clientY) > 4) {
            didDrag.current = true; setFollowGps(false);
        }

        if (pointers.current.size === 2) {
            const pts = [...pointers.current.values()];
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180 / Math.PI;
            const el = svgRef.current; const rect = el.getBoundingClientRect();
            const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
            if (lastPinchDist.current)
                applyZoom(dist / lastPinchDist.current, (cx - rect.left) * (W / rect.width), (cy - rect.top) * (H / rect.height));
            if (lastPinchAngle.current != null) {
                const dAngle = angle - lastPinchAngle.current;
                setHeadingUp(false);
                setView(v => ({ ...v, rotation: (v.rotation - dAngle + 360) % 360 }));
            }
            lastPinchDist.current = dist;
            lastPinchAngle.current = angle;
        } else if (pointers.current.size === 1) {
            // Rotate pan delta to match map orientation
            const el = svgRef.current; const rect = el.getBoundingClientRect();
            const dsx = (e.clientX - prev.x) * (W / rect.width);
            const dsy = (e.clientY - prev.y) * (H / rect.height);
            const R = view.rotation * Math.PI / 180;
            const dpx = dsx * Math.cos(R) + dsy * Math.sin(R);
            const dpy = -dsx * Math.sin(R) + dsy * Math.cos(R);
            setView(v => ({ ...v, panX: v.panX + dpx, panY: v.panY + dpy }));
        }
    };

    const onPointerUp = (e) => {
        const wasDrag = didDrag.current;
        pointers.current.delete(e.pointerId);
        lastPinchDist.current = null;
        if (!wasDrag) handleTap(e.clientX, e.clientY);
    };

    const onWheel = (e) => {
        e.preventDefault();
        const el = svgRef.current; const rect = el.getBoundingClientRect();
        applyZoom(e.deltaY < 0 ? 1.15 : 0.87,
            (e.clientX - rect.left) * (W / rect.width),
            (e.clientY - rect.top) * (H / rect.height));
    };

    // ── Tap → show popup ──────────────────────────────────────
    const handleTap = (clientX, clientY) => {
        const base = clientToBase(clientX, clientY);
        if (!base) { setPopup(null); return; }
        const THRESH = 20 / view.zoom; // screen pixels → base coords

        // Check admin locations
        for (const [name, coords] of Object.entries(adminLocations)) {
            const p = project(coords.lat, coords.lng);
            if (Math.hypot(p.x - base.x, p.y - base.y) < THRESH) {
                const dist = gpsPos ? Math.round(haversineMetres(gpsPos.lat, gpsPos.lng, coords.lat, coords.lng)) : null;
                const sc = baseToClient(p.x, p.y);
                setPopup({ name, dist, x: sc.x, y: sc.y });
                return;
            }
        }

        // Check waypoints along route
        for (let i = 0; i < path.length; i++) {
            const n = walkGraph.nodeMap[path[i]];
            if (!n) continue;
            const p = project(n.lat, n.lng);
            if (Math.hypot(p.x - base.x, p.y - base.y) < THRESH) {
                const dist = gpsPos ? Math.round(haversineMetres(gpsPos.lat, gpsPos.lng, n.lat, n.lng)) : null;
                const label = n.label || `Waypoint ${i + 1}`;
                const isCurrent = i === waypointIdx;
                const sc = baseToClient(p.x, p.y);
                setPopup({ name: label, dist, isCurrent, waypointNum: i + 1, x: sc.x, y: sc.y });
                return;
            }
        }
        setPopup(null);
    };

    // ── Fit to route ─────────────────────────────────────────
    const fitToRoute = () => {
        if (path.length === 0) return;
        const pts = path.map(id => walkGraph.nodeMap[id]).filter(Boolean).map(n => project(n.lat, n.lng));
        if (pts.length === 0) return;
        const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
        const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
        const rangeX = maxX - minX || 60, rangeY = maxY - minY || 60;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(W / (rangeX + 80), H / (rangeY + 80))));
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        setView({ zoom: newZoom, panX: W / 2 - cx * newZoom, panY: H / 2 - cy * newZoom });
        setFollowGps(false);
    };

    // ── Computed values ───────────────────────────────────────
    const pathPts = useMemo(() => path.map(id => walkGraph.nodeMap[id]).filter(Boolean).map(n => project(n.lat, n.lng)), [path, walkGraph, project]);
    const pathStr = pathPts.map(p => `${p.x},${p.y}`).join(' ');
    const segLines = useMemo(() => segments.map(s => ({
        id: s.id,
        floor: s.floor ?? 'ground',
        s: project(s.start.lat, s.start.lng),
        e: project(s.end.lat, s.end.lng)
    })), [segments, project]);
    const adminMarkers = useMemo(() => Object.entries(adminLocations).map(([name, c]) => ({ name, ...project(c.lat, c.lng), isDest: adminDest?.name === name })), [adminLocations, project, adminDest]);
    const guideDot = useMemo(() => guideLineTarget ? project(guideLineTarget.lat, guideLineTarget.lng) : null, [guideLineTarget, project]);

    const distance = distanceToDest();
    const nextDist = distanceToNextWaypoint();
    const currentWpNode = walkGraph.nodeMap[path[waypointIdx]];

    // ── Scale bar ─────────────────────────────────────────────
    const mPerPx = BASE_SPAN_M / (W * view.zoom); // metres per base-coord pixel
    const rawM = W * 0.25 * mPerPx;
    const niceM = rawM >= 50 ? Math.round(rawM / 10) * 10 : rawM >= 10 ? Math.round(rawM / 5) * 5 : Math.round(rawM);
    const scaleBarW = niceM / mPerPx; // in base coords

    // ── Heading cone ─────────────────────────────────────────
    const headingCone = useMemo(() => {
        if (!displayDot || compassHeading == null) return null;
        const rad = (compassHeading - 90) * Math.PI / 180;
        const len = 28;
        return {
            x1: displayDot.x + Math.cos(rad - 0.3) * len,
            y1: displayDot.y + Math.sin(rad - 0.3) * len,
            x2: displayDot.x + Math.cos(rad + 0.3) * len,
            y2: displayDot.y + Math.sin(rad + 0.3) * len,
            tip: { x: displayDot.x + Math.cos(rad) * len * 1.3, y: displayDot.y + Math.sin(rad) * len * 1.3 },
        };
    }, [displayDot, compassHeading]);

    // Transform: rotate around SVG center, then pan+zoom in map space
    const tx = `translate(${W / 2} ${H / 2}) rotate(${-view.rotation}) translate(${-W / 2 + view.panX} ${-H / 2 + view.panY}) scale(${view.zoom})`;

    return (
        <div className="fm-root">
            {/* Header */}
            <div className="fm-header">
                <button className="fm-back-btn" onClick={goBack}>‹ Back</button>
                <h2 className="fm-title">🗺️ Campus Map</h2>
                <div style={{ width: 60 }} />
            </div>

            {/* Direction banner */}
            {isOffTrack && (
                <div className="fm-offtrack-banner">
                    <span className="fm-offtrack-icon">⚠️</span>
                    <span>Off route ({offTrackDist}m) — rerouting…</span>
                </div>
            )}
            {directionInstruction && !isOffTrack && path.length > 0 && (
                <div className="fm-direction-banner">
                    <span className="fm-direction-text">{directionInstruction}</span>
                    {currentWpNode?.label && <span className="fm-direction-target">toward {currentWpNode.label}</span>}
                </div>
            )}

            {/* SVG Map */}
            <div className="fm-map-wrap" style={{ position: 'relative' }}>
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${W} ${H}`}
                    className="fm-svg"
                    style={{ touchAction: 'none', cursor: 'grab' }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onWheel={onWheel}
                >
                    <rect width={W} height={H} fill="#09101e" />

                    <g transform={tx}>
                        {/* Grid (subtle) */}
                        {Array.from({ length: 19 }).map((_, i) => {
                            const v2 = W * (i + 1) / 20, h2 = H * (i + 1) / 20;
                            return <g key={i} opacity="0.04"><line x1={v2} y1={0} x2={v2} y2={H} stroke="#6366f1" strokeWidth="0.5" /><line x1={0} y1={h2} x2={W} y2={h2} stroke="#6366f1" strokeWidth="0.5" /></g>;
                        })}

                        {/* Walkable segments — coloured by floor */}
                        {segLines.map(seg => {
                            const isFirst = seg.floor === 'first';
                            return (
                                <line key={seg.id} x1={seg.s.x} y1={seg.s.y} x2={seg.e.x} y2={seg.e.y}
                                    stroke={isFirst ? 'rgba(245,158,11,.35)' : 'rgba(99,102,241,.35)'}
                                    strokeWidth={4 / view.zoom} strokeLinecap="round" />
                            );
                        })}

                        {/* Stair node indicators */}
                        {walkGraph.nodes.filter(n => n.label?.toLowerCase().includes('stair')).map(n => {
                            const p = project(n.lat, n.lng);
                            const r = 6 / view.zoom;
                            return (
                                <g key={n.id}>
                                    <rect x={p.x - r} y={p.y - r} width={r * 2} height={r * 2}
                                        fill="#f59e0b" stroke="white" strokeWidth={1 / view.zoom}
                                        transform={`rotate(45 ${p.x} ${p.y})`} />
                                    {view.zoom > 2 && <text x={p.x} y={p.y - r - 3 / view.zoom} textAnchor="middle" fill="#fbbf24" fontSize={7 / view.zoom} fontFamily="Inter">🪜</text>}
                                </g>
                            );
                        })}

                        {/* Route path */}
                        {pathStr && (
                            <>
                                {/* Shadow */}
                                <polyline points={pathStr} fill="none" stroke="rgba(99,102,241,0.3)"
                                    strokeWidth={10 / view.zoom} strokeLinecap="round" strokeLinejoin="round" />
                                {/* Main line */}
                                <polyline points={pathStr} fill="none" stroke="#6366f1"
                                    strokeWidth={4 / view.zoom} strokeDasharray={`${10 / view.zoom} ${6 / view.zoom}`}
                                    strokeLinecap="round" className="fm-route-line" />
                            </>
                        )}

                        {/* Waypoint nodes */}
                        {pathPts.map((p, i) => {
                            const isCurrent = i === waypointIdx;
                            const isPassed = i < waypointIdx;
                            const r = (isCurrent ? 9 : 5) / view.zoom;
                            return (
                                <g key={i}>
                                    {isCurrent && <circle cx={p.x} cy={p.y} r={16 / view.zoom} fill="rgba(99,102,241,.15)" className="fm-waypoint-pulse" />}
                                    <circle cx={p.x} cy={p.y} r={r} fill={isPassed ? '#334' : isCurrent ? '#818cf8' : '#4f6db5'} stroke={isCurrent ? 'white' : 'rgba(255,255,255,0.3)'} strokeWidth={1.5 / view.zoom} />
                                    {view.zoom > 2.5 && walkGraph.nodeMap?.[path[i]]?.label && (
                                        <text x={p.x} y={p.y - (r + 4)} textAnchor="middle" fill={isCurrent ? '#a5b4fc' : '#6b7db5'}
                                            fontSize={9 / view.zoom} fontFamily="Inter" fontWeight={isCurrent ? 'bold' : 'normal'}>
                                            {walkGraph.nodeMap[path[i]].label}
                                        </text>
                                    )}
                                </g>
                            );
                        })}

                        {/* Admin location markers */}
                        {adminMarkers.map(m => {
                            const r = (m.isDest ? 9 : 6) / view.zoom;
                            return (
                                <g key={m.name}>
                                    {m.isDest && <circle cx={m.x} cy={m.y} r={18 / view.zoom} fill="rgba(245,158,11,.15)" className="fm-dest-pulse" />}
                                    <rect x={m.x - r} y={m.y - r} width={r * 2} height={r * 2}
                                        fill={m.isDest ? '#f59e0b' : '#fb923c'} stroke={m.isDest ? 'white' : '#1a0a00'}
                                        strokeWidth={1.5 / view.zoom} transform={`rotate(45 ${m.x} ${m.y})`} />
                                    <text x={m.x} y={m.y - r - 5 / view.zoom} textAnchor="middle"
                                        fill={m.isDest ? '#fde68a' : '#fed7aa'} fontSize={9 / view.zoom}
                                        fontWeight={m.isDest ? 'bold' : 'normal'} fontFamily="Inter">
                                        {m.name.length > 14 ? m.name.slice(0, 13) + '…' : m.name}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Guide line (off-track) */}
                        {userDot && guideDot && isOffTrack && (
                            <g>
                                <line x1={userDot.x} y1={userDot.y} x2={guideDot.x} y2={guideDot.y}
                                    stroke="#f59e0b" strokeWidth={2 / view.zoom} strokeDasharray={`${5 / view.zoom} ${3 / view.zoom}`} />
                                <circle cx={guideDot.x} cy={guideDot.y} r={4 / view.zoom} fill="#f59e0b" stroke="white" strokeWidth={1 / view.zoom} />
                            </g>
                        )}

                        {/* Heading cone */}
                        {headingCone && displayDot && (
                            <polygon
                                points={`${displayDot.x},${displayDot.y} ${headingCone.x1},${headingCone.y1} ${headingCone.tip.x},${headingCone.tip.y} ${headingCone.x2},${headingCone.y2}`}
                                fill="rgba(99,202,255,0.25)" stroke="rgba(99,202,255,0.6)" strokeWidth={0.8 / view.zoom}
                            />
                        )}

                        {/* GPS accuracy circle */}
                        {displayDot && gpsPos?.accuracy && (
                            <circle cx={displayDot.x} cy={displayDot.y}
                                r={Math.min(gpsPos.accuracy / (BASE_SPAN_M / W), 60)}
                                fill="rgba(129,140,248,0.06)" stroke="rgba(129,140,248,0.25)" strokeWidth={0.5 / view.zoom} />
                        )}

                        {/* User dot */}
                        {displayDot && (
                            <g>
                                <circle cx={displayDot.x} cy={displayDot.y} r={14 / view.zoom} fill="#6366f1" opacity="0.15" className="fm-user-ripple" />
                                <circle cx={displayDot.x} cy={displayDot.y} r={8 / view.zoom} fill="#818cf8" stroke="white" strokeWidth={2 / view.zoom} />
                                <circle cx={displayDot.x} cy={displayDot.y} r={3 / view.zoom} fill="white" />
                            </g>
                        )}

                        {/* Destination pin */}
                        {adminDest && (() => { const p = project(adminDest.lat, adminDest.lng); return <text x={p.x} y={p.y - 16 / view.zoom} textAnchor="middle" fontSize={18 / view.zoom}>📍</text>; })()}

                        {/* Scale bar — fixed to viewport via inverse transform */}
                        <g transform={`translate(${W / 2} ${H / 2}) rotate(${view.rotation}) translate(${-W / 2} ${-H / 2}) translate(${(-view.panX + 16) / view.zoom} ${(-view.panY + H - 24) / view.zoom})`}>
                            <rect x={0} y={0} width={scaleBarW} height={3 / view.zoom} rx={1 / view.zoom} fill="#6366f1" opacity={0.8} />
                            <text x={scaleBarW / 2} y={-4 / view.zoom} textAnchor="middle" fill="#a5b4fc" fontSize={8 / view.zoom} fontFamily="Inter">{niceM}m</text>
                        </g>
                    </g>
                </svg>

                {/* Zoom controls */}
                <div className="fm-zoom-panel">
                    <button className="fm-zoom-btn" onClick={() => { applyZoom(1.4, W / 2, H / 2); }}>+</button>
                    <button className="fm-zoom-btn" onClick={() => { applyZoom(0.72, W / 2, H / 2); }}>−</button>
                    <button className="fm-zoom-btn" title="Fit route" onClick={fitToRoute}>⊞</button>
                    <button className={`fm-zoom-btn ${followGps ? 'active' : ''}`} title="Follow GPS" onClick={() => setFollowGps(v => !v)}>◎</button>
                    <button className={`fm-zoom-btn ${headingUp ? 'active' : ''}`} title="Heading up" onClick={() => { setHeadingUp(v => !v); setFollowGps(true); }}>🧭</button>
                    {/* Floor toggle */}
                    <button className={`fm-zoom-btn`}
                        title={`Currently: ${currentFloor === 'first' ? '1st Floor' : 'Ground Floor'} — tap to switch`}
                        onClick={() => changeFloor(currentFloor === 'first' ? 'ground' : 'first')}
                        style={{ fontSize: 11, fontWeight: 700, color: currentFloor === 'first' ? '#fbbf24' : '#818cf8' }}
                    >
                        {currentFloor === 'first' ? '1F' : 'GF'}
                    </button>
                </div>

                {/* Cross-floor stair banner */}
                {crossFloorPending && (
                    <div style={{
                        position: 'absolute', bottom: 90, left: 12, right: 12,
                        background: 'rgba(245,158,11,.95)', borderRadius: 16, padding: '14px 18px',
                        boxShadow: '0 8px 32px rgba(0,0,0,.5)', zIndex: 30,
                        display: 'flex', flexDirection: 'column', gap: 10, backdropFilter: 'blur(12px)',
                    }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#1a0a00' }}>
                            🪜 {pendingFloor === 'first' ? 'Go upstairs now!' : 'Go downstairs now!'}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(26,10,0,.7)' }}
                        >Walk up the stairs, then tap the button below.</div>
                        <button onClick={confirmFloorChange} style={{
                            padding: '10px', borderRadius: 10, background: '#1a0a00',
                            color: '#fbbf24', fontWeight: 700, fontSize: 13,
                        }}>
                            ✅ I'm on the {pendingFloor === 'first' ? '1st' : 'ground'} floor now
                        </button>
                    </div>
                )}

                {/* North compass — tap to snap to North, shows rotation */}
                <button
                    className="fm-north-compass"
                    onClick={() => { setView(v => ({ ...v, rotation: 0 })); setHeadingUp(false); }}
                    title="Tap to snap North to top"
                >
                    <span style={{ display: 'block', transform: `rotate(${-view.rotation}deg)`, transition: 'transform 0.3s', fontSize: 18, lineHeight: 1 }}>↑</span>
                    <span style={{ fontSize: 9, color: '#6366f1', fontWeight: 700 }}>N</span>
                </button>

                {/* Tap popup */}
                {popup && (
                    <div className="fm-popup" style={{ left: popup.x, top: popup.y - 10 }}>
                        <button className="fm-popup-close" onClick={() => setPopup(null)}>✕</button>
                        <div className="fm-popup-name">{popup.name}</div>
                        {popup.dist != null && <div className="fm-popup-dist">📍 {popup.dist}m away</div>}
                        {popup.isCurrent && <div className="fm-popup-badge">⭐ Next waypoint</div>}
                        {popup.waypointNum && <div className="fm-popup-sub">Waypoint {popup.waypointNum} of {path.length}</div>}
                    </div>
                )}
            </div>

            {/* Bottom info + CTA */}
            {(adminDest || destNodeId) && (
                <div className="fm-bottom-panel">
                    <div className="fm-route-info">
                        <div className="fm-info-item"><span className="fm-info-label">Total</span><span className="fm-info-value">{distance != null ? `${distance}m` : '--'}</span></div>
                        <div className="fm-info-item"><span className="fm-info-label">Next WP</span><span className="fm-info-value fm-info-value--small">{nextDist != null ? `${nextDist}m` : '--'}</span></div>
                        <div className="fm-info-item"><span className="fm-info-label">Progress</span><span className="fm-info-value">{waypointIdx + 1}/{path.length}</span></div>
                        <div className="fm-info-item"><span className="fm-info-label">Zoom</span><span className="fm-info-value">{view.zoom.toFixed(1)}×</span></div>
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
