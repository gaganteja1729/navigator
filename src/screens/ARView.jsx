import { useEffect, useRef, useState } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import '../styles/ARView.css';

export default function ARView() {
    const {
        arrowAngle,
        path, arrived,
        clearDestination, destName,
        goBack,
    } = useNav();

    const videoRef = useRef(null);
    const [cameraError, setCameraError] = useState(false);
    const [permAsked, setPermAsked] = useState(false);

    const angle = arrowAngle();

    // ── Request iOS compass permission ────────────────────────
    const requestOrientPerm = async () => {
        if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
            try { await DeviceOrientationEvent.requestPermission(); } catch (_) { }
        }
        setPermAsked(true);
    };

    // ── Camera ────────────────────────────────────────────────
    useEffect(() => {
        let stream;
        (async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }, audio: false,
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch {
                setCameraError(true);
            }
        })();
        if (typeof DeviceOrientationEvent?.requestPermission !== 'function') setPermAsked(true);
        return () => stream?.getTracks().forEach(t => t.stop());
    }, []);

    return (
        <div className="ar-root">

            {/* ── Camera / fallback ── */}
            {!cameraError
                ? <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
                : <div className="ar-fallback"><div className="ar-fallback-grid" /></div>
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

            {/* ── Back button ── */}
            <button className="ar-back-btn" onClick={goBack}>‹ Map</button>

            {/* ── Navigation Arrow ── */}
            {path.length > 0 && !arrived && (
                <div className="ar-arrow-center">
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
        </div>
    );
}