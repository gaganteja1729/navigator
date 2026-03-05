import { useState } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import '../styles/HomeScreen.css';

// ── Predefined campus locations (same list as admin) ──────────
const CAMPUS_LOCATIONS = [
    { name: 'Canteen', icon: '🍽️' },
    { name: 'Main Gate', icon: '🚪' },
    { name: 'Dot Net Lab', icon: '💻' },
    { name: 'Main Block', icon: '🏫' },
    { name: 'Drinking Water', icon: '💧' },
    { name: 'Compute Block', icon: '🖥️' },
    { name: 'CME 1st Year', icon: '📚' },
    { name: 'CME 3rd Year', icon: '📚' },
    { name: 'Playground', icon: '⚽' },
];

export default function HomeScreen() {
    const {
        currentFloor,
        gpsPos, gpsError,
        navigate,
        adminLocations,
        selectAdminDestination,
    } = useNav();

    const [query, setQuery] = useState('');

    // Build destination list from admin-saved locations only
    const savedLocations = CAMPUS_LOCATIONS
        .filter(loc => adminLocations[loc.name])
        .map(loc => ({
            ...loc,
            lat: adminLocations[loc.name].lat,
            lng: adminLocations[loc.name].lng,

        }));

    const filtered = savedLocations.filter(loc =>
        loc.name.toLowerCase().includes(query.toLowerCase())
    );

    const handleSelectLocation = (loc) => {
        selectAdminDestination(loc.name, loc.lat, loc.lng);
    };

    return (
        <div className="hs-root">
            {/* Header */}
            <div className="hs-header">
                <div className="hs-header-top">
                    <h1 className="hs-title">🏫 Campus Nav</h1>
                    <span className={`hs-gps-badge ${gpsPos ? 'active' : 'inactive'}`}>
                        {gpsPos ? '📍 GPS' : gpsError ? '⚠️ No GPS' : '⏳ GPS…'}
                    </span>
                </div>
                <div className="hs-header-bottom-row">
                    <p className="hs-floor-label">
                        On: <strong>{currentFloor === 'ground' ? 'Ground Floor' : '1st Floor'}</strong>
                        <button
                            className="hs-switch-link"
                            onClick={() => navigate('floor-select')}
                        >Change</button>
                    </p>
                    <button className="hs-admin-btn" onClick={() => navigate('admin')}>
                        🛠️ Admin
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="hs-search-wrap">
                <span className="hs-search-icon">🔍</span>
                <input
                    className="hs-search"
                    placeholder="Search destination…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
                {query && (
                    <button className="hs-clear" onClick={() => setQuery('')}>✕</button>
                )}
            </div>

            {/* GPS accuracy banner */}
            {gpsPos && (
                <div className="hs-acc-banner">
                    GPS ±{Math.round(gpsPos.accuracy)}m
                    {gpsPos.accuracy > 20 && <span className="hs-acc-warn"> — try outdoors</span>}
                </div>
            )}

            {/* Destination list */}
            <div className="hs-list">
                {savedLocations.length === 0 && !query && (
                    <div className="hs-empty-state">
                        <div className="hs-empty-icon">📌</div>
                        <h3 className="hs-empty-title">No locations set up yet</h3>
                        <p className="hs-empty-text">
                            Go to <strong>Admin</strong> to save GPS coordinates for campus locations.
                        </p>
                        <button className="hs-empty-btn" onClick={() => navigate('admin')}>
                            🛠️ Open Admin
                        </button>
                    </div>
                )}

                {savedLocations.length > 0 && filtered.length === 0 && query && (
                    <p className="hs-empty">No results for &ldquo;{query}&rdquo;</p>
                )}

                {filtered.map(loc => (
                    <button
                        key={loc.name}
                        className="hs-dest-card"
                        onClick={() => handleSelectLocation(loc)}
                    >
                        <span className="hs-dest-icon">{loc.icon}</span>
                        <div className="hs-dest-info">
                            <span className="hs-dest-name">{loc.name}</span>
                            <span className="hs-dest-type">
                                📍 GPS saved · Tap to navigate





                            </span>
                        </div>
                        <span className="hs-dest-arrow">›</span>
                    </button>
                ))}
            </div>

            {/* Quick stats footer */}
            {savedLocations.length > 0 && (
                <div className="hs-footer">
                    <span className="hs-footer-stat">
                        {savedLocations.length} location{savedLocations.length !== 1 ? 's' : ''} available
                    </span>
                </div>
            )}
        </div>
    );
}