import { readFileSync } from 'fs';
import { join } from 'path';

// Vercel Serverless Function: Serves update-bundle.json with full CORS support.
// This handles OPTIONS preflight properly, which static file hosting cannot guarantee.
// Used by Cupcake Provider Manager's update system via risuFetch(plainFetchForce).

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
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
        const data = readFileSync(bundlePath, 'utf-8');
        res.writeHead(200, {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
        });
        res.end(data);
    } catch (err) {
        res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read update bundle', details: err.message }));
    }
}
