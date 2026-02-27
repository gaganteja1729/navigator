import { useEffect, useRef, useState } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import '../styles/ARView.css';

export default function ARView() {
    const {
        arrowAngle, distanceToDest,
        destNodeId, nodeMap,
        path, waypointIdx,
        arrived, setArrived,
        clearDestination,
        compassHeading,
        goBack, navigate,
    } = useNav();

    const videoRef = useRef(null);
    const [cameraError, setCameraError] = useState(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [simHeading, setSimHeading] = useState(null);
    const [permAsked, setPermAsked] = useState(false);

    const dest = destNodeId ? nodeMap[destNodeId] : null;
    const angle = arrowAngle();
    const distance = distanceToDest();
    const nextNode = path[waypointIdx] ? nodeMap[path[waypointIdx]] : null;
    const crossFloor = path.some(id => {
        const { walkGraph } = useNav ? {} : {};
        return false;
    });

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
                        <p className="ar-arrived-sub">{dest?.name}</p>
                        <button className="ar-arrived-btn" onClick={() => { clearDestination(); }}>
                            Back to Home
                        </button>
                    </div>
                </div>
            )}

            {/* Top HUD */}
            <div className="ar-hud-top">
                <button className="ar-back" onClick={goBack}>‹ Map</button>
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
                    <div className="ar-arrow" style={{ transform: `rotate(${simHeading !== null ? simHeading : angle}deg)` }}>
                        <div className="ar-arrow-body" />
                        <div className="ar-arrow-head" />
                    </div>
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
                        <span className="ar-info-label">Next Stop</span>
                        <span className="ar-info-val ar-info-val--small">{nextNode?.name ?? '--'}</span>
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
