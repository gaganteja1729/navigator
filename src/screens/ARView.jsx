import { useEffect, useRef, useState } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import '../styles/ARView.css';

export default function ARView() {
    const {
        arrowAngle,
        path, arrived,
        clearDestination, destName,
        goBack,
        destIcon,
        compassHeading,
        distanceToDest,
        distanceToNextWaypoint,
        isOffTrack,
        offTrackDist,
        directionInstruction,
        walkGraph,
        waypointIdx,
        gpsPos,
        snappedPos,
    } = useNav();

    const videoRef = useRef(null);
    const [cameraError, setCameraError] = useState('');
    const [permAsked, setPermAsked] = useState(false);
    const [showMinimap, setShowMinimap] = useState(false);
    const orientationEvent = globalThis?.DeviceOrientationEvent;

    const angle = arrowAngle();
    const distToDest = distanceToDest();
    const distToNext = distanceToNextWaypoint();

    const routeNodes = path.map(id => walkGraph.nodeMap[id]).filter(Boolean);
    const activePos = snappedPos || gpsPos;

    const minimapData = (() => {
        if (routeNodes.length === 0) return null;
        const pts = [...routeNodes];
        if (activePos) pts.push(activePos);

        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        pts.forEach(p => {
            if (p.lat < minLat) minLat = p.lat;
            if (p.lat > maxLat) maxLat = p.lat;
            if (p.lng < minLng) minLng = p.lng;
            if (p.lng > maxLng) maxLng = p.lng;
        });

        const pad = 0.00012;
        minLat -= pad; maxLat += pad; minLng -= pad; maxLng += pad;
        const latSpan = Math.max(maxLat - minLat, 0.00001);
        const lngSpan = Math.max(maxLng - minLng, 0.00001);

        const project = (lat, lng) => ({
            x: ((lng - minLng) / lngSpan) * 100,
            y: ((maxLat - lat) / latSpan) * 100,
        });

        const routePoints = routeNodes.map(n => project(n.lat, n.lng));
        const currentPoint = activePos ? project(activePos.lat, activePos.lng) : null;
        const targetNode = routeNodes[Math.min(waypointIdx, routeNodes.length - 1)] || null;
        const targetPoint = targetNode ? project(targetNode.lat, targetNode.lng) : null;

        return { routePoints, currentPoint, targetPoint };
    })();

    // ── Request iOS compass permission ────────────────────────
    const requestOrientPerm = async () => {
        if (typeof orientationEvent?.requestPermission === 'function') {
            try { await orientationEvent.requestPermission(); } catch (_) { }
        }
        setPermAsked(true);
    };

    // ── Camera ────────────────────────────────────────────────
    useEffect(() => {
        let stream;
        (async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                setCameraError('Camera API is not supported on this browser.');
                return;
            }

            const options = [
                { video: { facingMode: { ideal: 'environment' } }, audio: false },
                { video: true, audio: false },
            ];

            try {
                for (const constraints of options) {
                    try {
                        stream = await navigator.mediaDevices.getUserMedia(constraints);
                        break;
                    } catch (_) {
                        // Try next camera option
                    }
                }

                if (!stream) {
                    setCameraError('Unable to access camera. Check browser permissions.');
                    return;
                }

                setCameraError('');
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    try {
                        await videoRef.current.play();
                    } catch {
                        setCameraError('Camera started but could not auto-play video preview.');
                    }
                }
            } catch (err) {
                const msg = err?.name === 'NotAllowedError'
                    ? 'Camera permission denied. Please allow camera access.'
                    : 'Unable to start camera preview.';
                setCameraError(msg);
            }
        })();
        if (typeof orientationEvent?.requestPermission !== 'function') setPermAsked(true);
        return () => stream?.getTracks().forEach(t => t.stop());
    }, [orientationEvent]);

    return (
        <div className="ar-root">

            {/* ── Camera / fallback ── */}
            {!cameraError
                ? <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
                : <div className="ar-fallback">
                    <div className="ar-fallback-grid" />
                    <div className="ar-offtrack-banner" style={{ top: '16px' }}>
                        ⚠️ {cameraError}
                    </div>
                </div>
            }

            {/* ── iOS permission gate ── */}
            {!permAsked && (
                <div className="ar-perm-overlay">
                    <div className="ar-perm-card">
                        <div className="ar-perm-icon">🧭</div>
                        <h2>Enable Compass</h2>
                        <p>AR navigation needs device orientation access.</p>
                        <button className="ar-perm-btn" onClick={requestOrientPerm}>Allow Compass</button>
                    </div>
                </div>
            )}

            {/* ── Arrived overlay ── */}
            {arrived && (
                <div className="ar-arrived-overlay">
                    <div className="ar-arrived-card">
                        <div className="ar-arrived-emoji">🎉</div>
                        <h2 className="ar-arrived-title">You have arrived!</h2>
                        <p className="ar-arrived-sub">{destName}</p>
                        <button className="ar-arrived-btn" onClick={clearDestination}>
                            Back to Home
                        </button>
                    </div>
                </div>
            )}

            {/* ── Top HUD ── */}
            <div className="ar-hud-top">
                <button className="ar-back" onClick={goBack}>‹ Map</button>
                <div className="ar-dest-pill">
                    {destIcon || '📍'} {destName || 'Destination'}
                </div>
                <div className="ar-compass">
                    <span className="ar-compass-needle" style={{ transform: `rotate(${compassHeading}deg)` }}>🧭</span>
                </div>
            </div>

            {/* ── Direction / off-track banner ── */}
            {!arrived && path.length > 0 && (
                isOffTrack
                    ? <div className="ar-offtrack-banner">⚠️ Off track by {offTrackDist}m. Move back toward the route.</div>
                    : <div className="ar-direction-banner">
                        <div className="ar-direction-text">{directionInstruction || '⬆️ Go straight'}</div>
                        <div className="ar-direction-target">towards {destName || 'destination'}</div>
                    </div>
            )}

            {/* ── No route hint (prevents blank AR state) ── */}
            {!arrived && path.length === 0 && (
                <div className="ar-direction-banner">
                    <div className="ar-direction-text">📍 No active route</div>
                    <div className="ar-direction-target">Select a destination from map, then open AR.</div>
                </div>
            )}

            {/* ── Navigation Arrow ── */}
            {path.length > 0 && !arrived && (
                <div className="ar-arrow-wrap">
                    <svg
                        width="100" height="140"
                        viewBox="0 0 100 140"
                        style={{
                            transform: `rotate(${angle}deg)`,
                            transition: 'transform 0.3s cubic-bezier(.34,1.56,.64,1)',
                            filter: 'drop-shadow(0 0 20px rgba(99,102,241,0.9))',
                        }}
                    >
                        {/* Gradient defs */}
                        <defs>
                            <linearGradient id="arHead" x1="0" y1="1" x2="0" y2="0">
                                <stop offset="0%" stopColor="#4338ca" />
                                <stop offset="60%" stopColor="#818cf8" />
                                <stop offset="100%" stopColor="#e0e7ff" />
                            </linearGradient>
                            <linearGradient id="arShaft" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#3730a3" />
                                <stop offset="50%" stopColor="#6366f1" />
                                <stop offset="100%" stopColor="#4338ca" />
                            </linearGradient>
                        </defs>

                        {/* Glow ellipse at base */}
                        <ellipse cx="50" cy="128" rx="26" ry="6"
                            fill="rgba(99,102,241,0.4)"
                            style={{ animation: 'arGlow 1.6s ease-in-out infinite' }} />

                        {/* Shaft */}
                        <rect x="36" y="66" width="24" height="60" rx="3"
                            fill="url(#arShaft)" />
                        {/* Shaft right bevel */}
                        <rect x="58" y="66" width="5" height="60" rx="2"
                            fill="#1e1b4b" opacity="0.7" />

                        {/* Arrow head */}
                        <polygon points="50,8 82,66 58,66 58,66 36,66 18,66"
                            fill="url(#arHead)" />
                        {/* Arrow head right bevel */}
                        <polygon points="50,8 82,66 58,66 50,14"
                            fill="#1e1b4b" opacity="0.55" />
                        {/* Specular highlight */}
                        <polygon points="50,10 52,10 26,64 18,64"
                            fill="rgba(255,255,255,0.18)" />
                    </svg>
                </div>
            )}

            {/* ── Mini-map ── */}
            {path.length > 0 && !arrived && (
                <>
                    <button
                        className={`ar-minimap-toggle ${showMinimap ? 'active' : ''}`}
                        onClick={() => setShowMinimap(v => !v)}
                        title="Toggle mini map"
                    >
                        🗺
                    </button>

                    {showMinimap && minimapData && (
                        <div className="ar-minimap">
                            <svg className="ar-minimap-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                                <rect x="0" y="0" width="100" height="100" fill="#0b1020" />

                                <polyline
                                    points={minimapData.routePoints.map(p => `${p.x},${p.y}`).join(' ')}
                                    fill="none"
                                    stroke="#6366f1"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />

                                {minimapData.targetPoint && (
                                    <circle cx={minimapData.targetPoint.x} cy={minimapData.targetPoint.y} r="3.8" fill="#f59e0b" />
                                )}

                                {minimapData.currentPoint && (
                                    <>
                                        <circle cx={minimapData.currentPoint.x} cy={minimapData.currentPoint.y} r="3.8" fill="#22d3ee" />
                                        <circle cx={minimapData.currentPoint.x} cy={minimapData.currentPoint.y} r="8" fill="none" stroke="rgba(34,211,238,.35)" strokeWidth="1" />
                                    </>
                                )}
                            </svg>
                        </div>
                    )}
                </>
            )}

            {/* ── Bottom HUD ── */}
            <div className="ar-hud-bottom">
                <div className="ar-info-row">
                    <div className="ar-info-box">
                        <span className="ar-info-label">Distance</span>
                        <span className="ar-info-val">{distToDest != null ? `${distToDest}m` : '--'}</span>
                    </div>
                    <div className="ar-info-box">
                        <span className="ar-info-label">Next Waypoint</span>
                        <span className="ar-info-val">{distToNext != null ? `${distToNext}m` : '--'}</span>
                    </div>
                    <div className="ar-info-box">
                        <span className="ar-info-label">Heading</span>
                        <span className="ar-info-val ar-info-val--small">{Math.round(compassHeading)}°</span>
                    </div>
                </div>
            </div>
        </div>
    );
}