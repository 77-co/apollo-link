import axios from 'axios';
import EventEmitter from 'events';
import express from 'express';

const router = express.Router();

import { generateState } from '../utils/helpers.js';

// Spotify credentials
const authSecret = process.env.SPOTIFY_AUTH_SECRET;
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `http://localhost:${process.env.PORT}/spotify/callback`;

const STARTING_PATH = '/spotify';

// State tracking for SSE
const authStates = new Map(); // Store auth states here
const eventEmitter = new EventEmitter();

// Redirect endpoint for QR code scanning
router.get('/auth/:state', async (req, res) => {
    const state = req.params.state;
    const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=user-read-playback-state user-modify-playback-state&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    if (!authStates.has(state)) return res.status(400).send('Invalid auth request.');

    // Notify that the user visited the link
    authStates.set(state, 'URL visited');
    eventEmitter.emit(state, { status: 'URL visited' });

    res.redirect(authUrl);
});

// SSE connection to send real-time updates
router.get('/sse/:state', (req, res) => {
    // Get the auth state from query params
    const state = req.params.state;

    // If state is invalid, close connection
    if (!authStates.has(state)) return res.status(400).send('Invalid auth request.');

    // Set up headers
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // flush the headers to establish SSE with client

    const keepaliveInterval = setInterval(() => {
        res.write(`data: ${JSON.stringify({ status: 'keep-alive' })}\n\n`);
    }, 10000);

    // This is a simple event handler for the eventEmitter.
    const handleEvent = (data, closeConnection = false) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        if (closeConnection) res.end();
    };

    eventEmitter.on(state, handleEvent);

    req.on('close', () => {
        eventEmitter.removeListener(state, handleEvent);
        clearInterval(keepaliveInterval);
    });
});

// Callback endpoint for Spotify to send authorization code
router.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!authStates.has(state)) return res.status(400).send('Invalid state');

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', null, {
            params: {
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                client_id: clientId,
                client_secret: clientSecret,
            },
        });

        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        // After successfully obtaining tokens in /callback
        eventEmitter.emit(state, { status: "User logged in", access_token, refresh_token, expires_in }, true);

        // Optionally: clear state after sending tokens to avoid re-use
        authStates.delete(state);

        res.sendFile(path.join(process.__dirname, 'html/spotify-login-success.html'));
    } catch (error) {
        console.error(error);
        res.status(500).send('Authorization failed.');
        authStates.delete(state);
    }
});

// Endpoint to initiate auth request
router.get('/start-auth', (req, res) => {
    const state = generateState();
    authStates.set(state, 'Waiting for URL visit');
    res.json({ state, url: `${req.protocol}://${req.get('host')}${STARTING_PATH}/auth/${state}` });
});

export default { startingPath: STARTING_PATH, router }; // Passing the starting path of the router here.