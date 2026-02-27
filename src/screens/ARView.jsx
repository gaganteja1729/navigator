import { useEffect, useRef, useState } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import '../styles/ARView.css';

export default function ARView() {
    const {
        arrowAngle,
        distanceToDest,
        destNodeId,
        nodeMap,
        path,
        waypointIdx,
        arrived,
        setArrived,
        setDestNodeId,
        compassHeading,
        setViewMode,
    } = useNav();

    const videoRef = useRef(null);
    const [cameraError, setCameraError] = useState(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [simHeading, setSimHeading] = useState(null); // desktop sim slider
    const [permAsked, setPermAsked] = useState(false);

    const dest = destNodeId ? nodeMap[destNodeId] : null;
    const angle = arrowAngle();
    const distance = distanceToDest();
    const nextNode = path[waypointIdx] ? nodeMap[path[waypointIdx]] : null;
    const crossFloor = path.some(id => {
        const n = nodeMap[id];
        return n && n.type === 'staircase';
    });

    // Request device-orientation permission (iOS 13+)
    const requestOrientPerm = async () => {
        if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
            try { await DeviceOrientationEvent.requestPermission(); } catch (_) { }
        }
        setPermAsked(true);
    };

    // Start camera
    useEffect(() => {
        let stream;
        const start = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' },
                    audio: false,
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => setCameraReady(true);
                }
            } catch (e) {
                setCameraError(e.message || 'Camera unavailable');
                setCameraReady(true); // show fallback bg
            }
        };
        start();
        if (typeof DeviceOrientationEvent?.requestPermission !== 'function') setPermAsked(true);
        return () => { stream?.getTracks().forEach(t => t.stop()); };
    }, []);

    const displayAngle = simHeading !== null
        ? (nextNode
            ? ((Math.atan2(
                nextNode.lng - (nodeMap[path[0]]?.lng ?? 0),
                nextNode.lat - (nodeMap[path[0]]?.lat ?? 0)
            ) * 180 / Math.PI + 360) % 360 - simHeading + 360) % 360
            : 0)
        : angle;

    return (
        <div className="ar-root">
            {/* Camera or fallback */}
            {!cameraError ? (
                <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
            ) : (
                <div className="ar-fallback">
                    <div className="ar-fallback-grid" />
                </div>
            )}

            {/* Permission gate overlay */}
            {!permAsked && (
                <div className="ar-perm-overlay">
                    <div className="ar-perm-card">
                        <div className="ar-perm-icon">🧭</div>
                        <h2>Enable Compass</h2>
                        <p>For AR navigation we need access to your device orientation.</p>
                        <button className="ar-perm-btn" onClick={requestOrientPerm}>
                            Allow Compass Access
                        </button>
                    </div>
                </div>
            )}

            {/* Arrived overlay */}
            {arrived && (
                <div className="ar-arrived-overlay">
                    <div className="ar-arrived-card">
                        <div className="ar-arrived-emoji">🎉</div>
                        <h2 className="ar-arrived-title">You have arrived!</h2>
                        <p className="ar-arrived-sub">{dest?.name}</p>
                        <button
                            className="ar-arrived-btn"
                            onClick={() => { setArrived(false); setDestNodeId(null); setViewMode('map'); }}
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            )}

            {/* Top HUD */}
            <div className="ar-hud-top">
                <button className="ar-back" onClick={() => setViewMode('map')}>‹ Map</button>
                <div className="ar-dest-pill">
                    <span>{dest?.icon} {dest?.name}</span>
                </div>
                <div className="ar-compass">
                    <div className="ar-compass-needle" style={{ transform: `rotate(${compassHeading}deg)` }}>↑</div>
                </div>
            </div>

            {/* AR Arrow */}
            {cameraReady && !arrived && (
                <div className="ar-arrow-wrap">
                    <div
                        className="ar-arrow"
                        style={{ transform: `rotate(${displayAngle}deg)` }}
                    >
                        <div className="ar-arrow-body" />
                        <div className="ar-arrow-head" />
                    </div>
                    {crossFloor && (
                        <div className="ar-floor-badge">🪜 Use Staircase</div>
                    )}
                </div>
            )}

            {/* Bottom HUD */}
            <div className="ar-hud-bottom">
                <div className="ar-info-row">
                    <div className="ar-info-box">
                        <span className="ar-info-label">Distance</span>
                        <span className="ar-info-val">{distance !== null ? `${distance} m` : '--'}</span>
                    </div>
                    <div className="ar-info-box">
                        <span className="ar-info-label">Next Stop</span>
                        <span className="ar-info-val">{nextNode?.name ?? '--'}</span>
                    </div>
                    <div className="ar-info-box">
                        <span className="ar-info-label">Heading</span>
                        <span className="ar-info-val">{Math.round(compassHeading)}°</span>
                    </div>
                </div>

                {/* Desktop simulation slider */}
                {cameraError && (
                    <div className="ar-sim-row">
                        <span>🖥️ Sim Heading</span>
                        <input
                            type="range" min="0" max="359" defaultValue="0"
                            onChange={e => setSimHeading(Number(e.target.value))}
                        />
                        <span>{simHeading ?? 0}°</span>
                    </div>
                )}
            </div>
        </div>
    );
}
