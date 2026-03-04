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
    } = useNav();

    const videoRef = useRef(null);
    const [cameraError, setCameraError] = useState(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [simHeading, setSimHeading] = useState(null);
    const [permAsked, setPermAsked] = useState(false);
    const [showMiniMap, setShowMiniMap] = useState(false);

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

            {/* Off-track warning */}
            {isOffTrack && !arrived && (
                <div className="ar-offtrack-banner">
                    <span>⚠️ Off route ({offTrackDist}m away) — rerouting…</span>
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

            {/* AR Arrow */}
            {cameraReady && !arrived && (
                <div className="ar-arrow-wrap">
                    <div className="ar-arrow" style={{ transform: `rotate(${simHeading !== null ? simHeading : angle}deg)` }}>
                        <div className="ar-arrow-body" />
                        <div className="ar-arrow-head" />
                    </div>
                </div>
            )}

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
