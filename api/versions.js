import { readFileSync } from 'fs';
import { join } from 'path';

// Vercel Serverless Function: Serves lightweight version manifest only.
// Returns just the "versions" portion of update-bundle.json (~0.5KB)
// Used by Cupcake Provider Manager's silent update notification system.

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
};

export default function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    try {
        const bundlePath = join(process.cwd(), 'update-bundle.json');
        const raw = readFileSync(bundlePath, 'utf-8');
        const bundle = JSON.parse(raw);

        // Return only versions (no code), keeping it lightweight
        const versionsOnly = bundle.versions || {};
        res.writeHead(200, {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
        });
        res.end(JSON.stringify(versionsOnly));
    } catch (err) {
        res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read versions', details: err.message }));
    }
}
