import { useState } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import '../styles/FloorSelect.css';

export default function FloorSelectScreen() {
    const { selectFloor } = useNav();
    const [selected, setSelected] = useState(null);

    return (
        <div className="fs-overlay">
            <div className="fs-card">
                <div className="fs-icon">🏫</div>
                <h1 className="fs-title">Campus Navigator</h1>
                <p className="fs-subtitle">Which floor are you on right now?</p>

                <div className="fs-options">
                    <button
                        className={`fs-btn ${selected === 'ground' ? 'active' : ''}`}
                        onClick={() => setSelected('ground')}
                    >
                        <span className="fs-btn-icon">🏠</span>
                        <span className="fs-btn-label">Ground Floor</span>
                        <span className="fs-btn-rooms">Rooms 101–103, Lab, Library…</span>
                    </button>

                    <button
                        className={`fs-btn ${selected === 'first' ? 'active' : ''}`}
                        onClick={() => setSelected('first')}
                    >
                        <span className="fs-btn-icon">🏢</span>
                        <span className="fs-btn-label">1st Floor</span>
                        <span className="fs-btn-rooms">Rooms 201–203, Electronics Lab…</span>
                    </button>
                </div>

                <button
                    className="fs-confirm"
                    disabled={!selected}
                    onClick={() => selectFloor(selected)}
                >
                    Start Navigating →
                </button>
            </div>
        </div>
    );
}
