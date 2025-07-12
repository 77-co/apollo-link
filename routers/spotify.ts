import axios from 'axios';
import EventEmitter from 'node:events';
import express, { Router, Request, Response } from 'express';
import path from 'node:path';
import { generateState } from '../utils/helpers.js';

const router: Router = express.Router();

// Spotify credentials
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `http://localhost:${process.env.PORT}/spotify/callback`;

if (!clientId || !clientSecret) {
    throw new Error("Spotify client ID or secret is not set in the environment variables.");
}

const STARTING_PATH = '/spotify';

// State tracking for SSE
const authStates = new Map<string, string>();
const eventEmitter = new EventEmitter();

// Redirect endpoint for QR code scanning
router.get('/auth/:state', async (req: Request<{ state: string }>, res: Response) => {
    const state = req.params.state;
    const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=user-read-playback-state user-modify-playback-state&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    if (!authStates.has(state)) return res.status(400).send('Invalid auth request.');

    // Notify that the user visited the link
    authStates.set(state, 'URL visited');
    eventEmitter.emit(state, { status: 'URL visited' });

    res.redirect(authUrl);
});

// SSE connection to send real-time updates
router.get('/sse/:state', (req: Request<{ state: string }>, res: Response) => {
    const state = req.params.state;

    if (!authStates.has(state)) return res.status(400).send('Invalid auth request.');

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const keepaliveInterval = setInterval(() => {
        res.write(`data: ${JSON.stringify({ status: 'keep-alive' })}\n\n`);
    }, 10000);

    const handleEvent = (data: any, closeConnection = false) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        if (closeConnection) res.end();
    };

    eventEmitter.on(state, handleEvent);

    req.on('close', () => {
        eventEmitter.removeListener(state, handleEvent);
        clearInterval(keepaliveInterval);
    });
});

interface SpotifyTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

router.get('/callback', async (req: Request<{}, {}, {}, { code: string; state: string }>, res: Response) => {
    const { code, state } = req.query;

    if (!authStates.has(state)) return res.status(400).send('Invalid state');

    try {
        const tokenResponse = await axios.post<SpotifyTokenResponse>('https://accounts.spotify.com/api/token', new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret,
        }));

        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        eventEmitter.emit(state, { status: "User logged in", access_token, refresh_token, expires_in }, true);

        authStates.delete(state);

        res.sendFile(path.join(process.cwd(), 'html/spotify-login-success.html'));
    } catch (error) {
        console.error(error);
        res.status(500).send('Authorization failed.');
        authStates.delete(state);
    }
});

// Endpoint to initiate auth request
router.get('/start-auth', (req: Request, res: Response) => {
    const state = generateState();
    authStates.set(state, 'Waiting for URL visit');
    res.json({ state, url: `${req.protocol}://${req.get('host')}${STARTING_PATH}/auth/${state}` });
});

export default { startingPath: STARTING_PATH, router };