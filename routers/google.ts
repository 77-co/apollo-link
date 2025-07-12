import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import path from 'path';
import EventEmitter from 'node:events';
import { promises as fs } from 'node:fs';
import { generateState } from '../utils/helpers.js';

const router: Router = Router();

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'google-cloud-credentials.json');
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const STARTING_PATH = '/google';

const authStates = new Map<string, string>();
const eventEmitter = new EventEmitter();

let oAuth2Client: OAuth2Client;

interface GoogleCredentials {
    web: {
        client_id: string;
        client_secret: string;
        redirect_uris: string[];
    }
}

async function initializeOAuthClient() {
    try {
        const credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
        const credentials: GoogleCredentials = JSON.parse(credentialsContent);
        const { client_id, client_secret } = credentials.web;
        if (!REDIRECT_URI) {
            throw new Error("GOOGLE_REDIRECT_URI is not set in the environment variables.");
        }
        oAuth2Client = new OAuth2Client(client_id, client_secret, REDIRECT_URI);
    } catch (error) {
        console.error("Failed to initialize Google OAuth client:", error);
        process.exit(1);
    }
}

initializeOAuthClient();

router.get('/auth/:state', async (req: Request<{ state: string }>, res: Response) => {
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

router.get('/callback', async (req: Request<{}, {}, {}, { code: string; state: string }>, res: Response) => {
    const { code, state } = req.query;

    if (!authStates.has(state)) return res.status(400).send('Invalid state');

    try {
        const { tokens } = await oAuth2Client.getToken(code);
        const { access_token, refresh_token, expiry_date } = tokens;

        eventEmitter.emit(state, { 
            status: "User logged in", 
            access_token, 
            refresh_token, 
            expires_in: expiry_date ? Math.floor((expiry_date - Date.now()) / 1000) : undefined
        }, true);

        authStates.delete(state);
        res.sendFile(path.join(process.cwd(), 'html/google-login-success.html'));
    } catch (error) {
        console.error(error);
        res.status(500).send('Authorization failed.');
        authStates.delete(state);
    }
});

router.get('/start-auth', (req: Request, res: Response) => {
    const state = generateState();
    authStates.set(state, 'Waiting for URL visit');
    res.json({ 
        state, 
        url: `${req.protocol}://${req.get('host')}${STARTING_PATH}/auth/${state}` 
    });
});

export default { startingPath: STARTING_PATH, router };