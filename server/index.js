import express from 'express';
import cors from 'cors';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data', 'nav-data.json');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

function normalizePayload(payload) {
    const segments = Array.isArray(payload?.segments) ? payload.segments : [];
    const locationCoords = payload?.locationCoords && typeof payload.locationCoords === 'object' && !Array.isArray(payload.locationCoords)
        ? payload.locationCoords
        : {};
    return { segments, locationCoords };
}

async function ensureDataFile() {
    const folder = path.dirname(DATA_FILE);
    await fs.mkdir(folder, { recursive: true });
    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, JSON.stringify({ segments: [], locationCoords: {} }, null, 2), 'utf-8');
    }
}

async function readNavData() {
    await ensureDataFile();
    try {
        const raw = await fs.readFile(DATA_FILE, 'utf-8');
        return normalizePayload(JSON.parse(raw));
    } catch {
        return { segments: [], locationCoords: {} };
    }
}

async function writeNavData(payload) {
    const normalized = normalizePayload(payload);
    await ensureDataFile();
    await fs.writeFile(DATA_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
    return normalized;
}

app.get('/api/nav-data', async (_req, res) => {
    const data = await readNavData();
    res.json(data);
});

app.put('/api/nav-data', async (req, res) => {
    const saved = await writeNavData(req.body ?? {});
    res.json(saved);
});

app.listen(PORT, () => {
    console.log(`Navigator API running at http://localhost:${PORT}`);
});
