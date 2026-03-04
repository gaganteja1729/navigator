// dont know
import { useEffect, useRef, useState } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import '../styles/ARView.css';

export default function ARView() {
    const {
        arrowAngle, distanceToDest, distanceToNextWaypoint,
        destNodeId, nodeMap,
        path, waypointIdx,
        arrived, setArrived,
        clearDestination,
        compassHeading,
        goBack, navigate,
        walkGraph,
        adminDest, destName, destIcon,
        isOffTrack, offTrackDist,
        directionInstruction,
        crossFloorPending, pendingFloor, confirmFloorChange,
        currentFloor, changeFloor,
    } = useNav();
    const fuck = null
    const videoRef = useRef(null);
    const [cameraError, setCameraError] = useState(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [permAsked, setPermAsked] = useState(false);
    const [showMiniMap, setShowMiniMap] = useState(false);

    // (debug state removed)

    const angle = arrowAngle();
    const distance = distanceToDest();
    const nextDist = distanceToNextWaypoint();
    const nextNode = path[waypointIdx] ? walkGraph.nodeMap[path[waypointIdx]] : null;

    const requestOrientPerm = async () => {
        if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
            try { await DeviceOrientationEvent.requestPermission(); } catch (_) { }
        }
        setPermAsked(true);
    };

    useEffect(() => {
        let stream;
        const start = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }, audio: false,
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => setCameraReady(true);
                }
            } catch (e) {
                setCameraError(e.message || 'Camera unavailable');
                setCameraReady(true);
            }
        };
        start();
        if (typeof DeviceOrientationEvent?.requestPermission !== 'function') setPermAsked(true);
        return () => { stream?.getTracks().forEach(t => t.stop()); };
    }, []);

    return (
        <div className="ar-root">
            {!cameraError ? (
                <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
            ) : (
                <div className="ar-fallback">
                    <div className="ar-fallback-grid" />
                </div>
            )}

            {/* Permission gate */}
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

            {/* Arrived overlay */}
            {arrived && (
                <div className="ar-arrived-overlay">
                    <div className="ar-arrived-card">
                        <div className="ar-arrived-emoji">🎉</div>
                        <h2 className="ar-arrived-title">You have arrived!</h2>
                        <p className="ar-arrived-sub">{destName}</p>
                        <button className="ar-arrived-btn" onClick={() => { clearDestination(); }}>
                            Back to Home
                        </button>
                    </div>
                </div>
            )}

            {/* Cross-floor staircase full-screen prompt */}
            {crossFloorPending && !arrived && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 50,
                    background: 'rgba(9,16,30,0.92)', backdropFilter: 'blur(16px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg,#78350f,#b45309)',
                        borderRadius: 24, padding: 32, margin: 24, textAlign: 'center',
                        boxShadow: '0 16px 64px rgba(0,0,0,.6)',
                    }}>
                        <div style={{ fontSize: 52, marginBottom: 12 }}>🪜</div>
                        <h2 style={{ color: 'white', fontWeight: 800, fontSize: 22, marginBottom: 8 }}>
                            {pendingFloor === 'first' ? 'Go Upstairs!' : 'Go Downstairs!'}
                        </h2>
                        <p style={{ color: 'rgba(255,255,255,.75)', fontSize: 13, marginBottom: 20 }}>
                            Walk to the staircase and climb {pendingFloor === 'first' ? 'up' : 'down'}.<br />Tap below when you reach the next floor.
                        </p>
                        <button onClick={confirmFloorChange} style={{
                            background: 'white', color: '#78350f', fontWeight: 800,
                            fontSize: 15, padding: '14px 28px', borderRadius: 14,
                            boxShadow: '0 4px 16px rgba(0,0,0,.3)',
                        }}>
                            ✅ I'm on the {pendingFloor === 'first' ? '1st' : 'ground'} floor!
                        </button>
                    </div>
                </div>
            )}

            {/* Off-track warning */}
            {isOffTrack && !arrived && (
                <div className="ar-offtrack-banner">
                    <span>⚠️ Off route ({offTrackDist}m away) — rerouting…</span>
                </div>
            )}

            {/* ── 3D Direction Arrow ── */}
            {path.length > 0 && !arrived && (
                <div className="ar-arrow-wrap">
                    <svg
                        width="90" height="130"
                        viewBox="0 0 90 130"
                        style={{ transform: `rotate(${angle}deg)`, transition: 'transform 0.25s cubic-bezier(.34,1.56,.64,1)', filter: 'drop-shadow(0 0 18px rgba(99,102,241,0.75))' }}
                    >
                        <defs>
                            <linearGradient id="arFront" x1="0" y1="1" x2="0" y2="0">
                                <stop offset="0" stopColor="#4338ca" />
                                <stop offset="0.5" stopColor="#818cf8" />
                                <stop offset="1" stopColor="#c7d2fe" />
                            </linearGradient>
                            <linearGradient id="arShaft" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0" stopColor="#4338ca" />
                                <stop offset="0.4" stopColor="#6366f1" />
                                <stop offset="1" stopColor="#3730a3" />
                            </linearGradient>
                        </defs>

                        {/* Glow ring */}
                        <ellipse cx="45" cy="120" rx="28" ry="6" fill="rgba(99,102,241,0.35)" className="ar-3d-glow" />

                        {/* Shaft — right dark side */}
                        <polygon points="55,120 60,120 60,62 55,62" fill="#1e1b4b" opacity="0.85" />
                        {/* Shaft — front face */}
                        <polygon points="32,120 55,120 55,62 32,62" fill="url(#arShaft)" />
                        {/* Shaft top edge highlight */}
                        <line x1="32" y1="62" x2="55" y2="62" stroke="rgba(199,210,254,0.5)" strokeWidth="1" />

                        {/* Head — right dark side */}
                        <polygon points="55,62 70,62 45,8 45,13" fill="#1e1b4b" opacity="0.8" />
                        {/* Head — front face */}
                        <polygon points="18,62 55,62 45,8" fill="url(#arFront)" />
                        {/* Head left highlight edge */}
                        <line x1="18" y1="62" x2="45" y2="8" stroke="rgba(199,210,254,0.4)" strokeWidth="1.5" />
                        {/* Specular sheen */}
                        <polygon points="22,62 45,12 45,8 18,62" fill="rgba(255,255,255,0.1)" />
                    </svg>

                    {directionInstruction && (
                        <div className="ar-direction-banner">
                            <span className="ar-direction-text">{directionInstruction}</span>
                            {nextNode?.label && <span className="ar-direction-target">→ {nextNode.label}</span>}
                        </div>
                    )}
                </div>
            )}

            {/* Top HUD */}
            <div className="ar-hud-top">
                <button className="ar-back" onClick={goBack}>‹ Map</button>
                <div className="ar-dest-pill">
                    <span>{destIcon} {destName}</span>
                </div>
                <div className="ar-compass">
                    <div className="ar-compass-needle" style={{ transform: `rotate(${compassHeading}deg)` }}>↑</div>
                </div>
            </div>

            {/* Direction instruction banner */}
            {cameraReady && !arrived && directionInstruction && (
                <div className="ar-direction-banner">
                    <span className="ar-direction-text">{directionInstruction}</span>
                    {nextNode?.label && (
                        <span className="ar-direction-target">toward {nextNode.label}</span>
                    )}
                </div>
            )}

            {/* (Old flat AR arrow removed here) */}
            {/* Mini-map toggle */}
            <button
                className={`ar-minimap-toggle ${showMiniMap ? 'active' : ''}`}
                onClick={() => setShowMiniMap(v => !v)}
            >
                🗺️
            </button>

            {/* Mini-map overlay */}
            {showMiniMap && (
                <div className="ar-minimap">
                    <svg viewBox="0 0 120 120" className="ar-minimap-svg">
                        <rect width="120" height="120" fill="rgba(9,16,30,0.85)" rx="8" />
                        <circle cx="60" cy="60" r="4" fill="#818cf8" stroke="white" strokeWidth="1" />
                        <text x="60" y="54" textAnchor="middle" fill="#6366f1" fontSize="6">You</text>
                        {/* Simple direction indicator */}
                        {(() => {
                            const rad = ((simHeading !== null ? simHeading : angle) - 90) * Math.PI / 180;
                            const dx = Math.cos(rad) * 35;
                            const dy = Math.sin(rad) * 35;
                            return (
                                <g>
                                    <line x1={60} y1={60} x2={60 + dx} y2={60 + dy}
                                        stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                                    <circle cx={60 + dx} cy={60 + dy} r="3" fill="#f59e0b" />
                                    <text x={60 + dx} y={60 + dy - 6} textAnchor="middle"
                                        fill="#fde68a" fontSize="5" fontWeight="bold">
                                        {destName?.slice(0, 8)}
                                    </text>
                                </g>
                            );
                        })()}
                    </svg>
                </div>
            )}

            {/* Bottom HUD */}
            <div className="ar-hud-bottom">
                <div className="ar-info-row">
                    <div className="ar-info-box">
                        <span className="ar-info-label">Distance</span>
                        <span className="ar-info-val">{distance !== null ? `${distance}m` : '--'}</span>
                    </div>
                    <div className="ar-info-box">
                        <span className="ar-info-label">Next</span>
                        <span className="ar-info-val ar-info-val--small">
                            {nextDist !== null ? `${nextDist}m` : '--'}
                        </span>
                    </div>
                    <div className="ar-info-box">
                        <span className="ar-info-label">Waypoint</span>
                        <span className="ar-info-val">{waypointIdx + 1}/{path.length}</span>
                    </div>
                    <div className="ar-info-box">
                        <span className="ar-info-label">Heading</span>
                        <span className="ar-info-val">{Math.round(compassHeading)}°</span>
                    </div>
                </div>
                {cameraError && (
                    <div className="ar-sim-row">
                        <span>🖥️ Sim</span>
                        <input type="range" min="0" max="359" defaultValue="0"
                            onChange={e => setSimHeading(Number(e.target.value))} />
                        <span>{simHeading ?? 0}°</span>
                    </div>
                )}
            </div>
        </div>
    );
}

