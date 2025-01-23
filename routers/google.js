import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import path from 'path';
import EventEmitter from 'node:events';
import { promises as fs } from 'node:fs';
import { generateState } from '../utils/helpers.js';

const router = Router();

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CREDENTIALS_PATH = path.join(process.__dirname, 'google-cloud-credentials.json');
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const STARTING_PATH = '/google';

const authStates = new Map();
const eventEmitter = new EventEmitter();

let oAuth2Client;

// Initialize OAuth client
async function initializeOAuthClient() {
    const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH));
    const { client_id, client_secret } = credentials.web;
    oAuth2Client = new OAuth2Client(client_id, client_secret, REDIRECT_URI);
}

// Initialize on startup
initializeOAuthClient();

router.get('/auth/:state', async (req, res) => {
    const state = req.params.state;
    
    if (!authStates.has(state)) return res.status(400).send('Invalid auth request.');
    
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: state
    });

    authStates.set(state, 'URL visited');
    eventEmitter.emit(state, { status: 'URL visited' });
    
    res.redirect(authUrl);
});

router.get('/sse/:state', (req, res) => {
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

router.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!authStates.has(state)) return res.status(400).send('Invalid state');

    try {
        const { tokens } = await oAuth2Client.getToken(code);
        const { access_token, refresh_token, expiry_date } = tokens;

        eventEmitter.emit(state, { 
            status: "User logged in", 
            access_token, 
            refresh_token, 
            expires_in: Math.floor((expiry_date - Date.now()) / 1000)
        }, true);

        authStates.delete(state);
        res.sendFile(path.join(process.__dirname, 'html/google-login-success.html'));
    } catch (error) {
        console.error(error);
        res.status(500).send('Authorization failed.');
        authStates.delete(state);
    }
});

router.get('/start-auth', (req, res) => {
    const state = generateState();
    authStates.set(state, 'Waiting for URL visit');
    res.json({ 
        state, 
        url: `${req.protocol}://${req.get('host')}${STARTING_PATH}/auth/${state}` 
    });
});

export default { startingPath: STARTING_PATH, router };