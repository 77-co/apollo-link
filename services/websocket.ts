import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { redis, pool } from '../utils/db.js';
import crypto from 'node:crypto';
import url from 'node:url';

interface Device {
    device_id: string;
    public_key: string;
}

const connectedDevices = new Map<string, WebSocket>();
let wss: WebSocketServer;

export function initializeWebSocket(server: Server) {
    wss = new WebSocketServer({ server });

    wss.on('connection', async (ws, req) => {
        const parameters = new url.URL(req.url || '', `http://${req.headers.host || ''}`).searchParams;
        const deviceId = parameters.get('deviceId');
        const signature = parameters.get('signature');
        const challenge = parameters.get('challenge');

        if (!deviceId || !signature || !challenge) {
            ws.close(1008, 'Missing credentials');
            return;
        }

        try {
            const { rows } = await pool.query<Device>('SELECT public_key FROM devices WHERE device_id = $1', [deviceId]);
            if (rows.length === 0) {
                ws.close(1008, 'Device not found');
                return;
            }
            const { public_key } = rows[0];

            const verify = crypto.createVerify('SHA256');
            verify.update(challenge);
            const isVerified = verify.verify(public_key, signature, 'base64');

            if (isVerified) {
                console.log(`Device ${deviceId} authenticated and connected.`);
                connectedDevices.set(deviceId, ws);

                const subscriber = redis.duplicate();
                // No need to connect with ioredis v5
                await subscriber.subscribe(`device-notifications:${deviceId}`, (err, count) => {
                    if (err) {
                        console.error(`Error subscribing to ${deviceId}'s channel:`, err);
                        return;
                    }
                    console.log(`Subscribed to ${count} channels. Listening for updates for ${deviceId}...`);
                });

                subscriber.on('message', (channel, message) => {
                    ws.send(message);
                });

                ws.on('close', () => {
                    console.log(`Device ${deviceId} disconnected.`);
                    connectedDevices.delete(deviceId);
                    subscriber.unsubscribe();
                    subscriber.quit();
                });
            } else {
                ws.close(1008, 'Invalid signature');
            }
        } catch (error) {
            console.error('Error during WebSocket authentication:', error);
            ws.close(1011, 'Internal server error');
        }
    });

    console.log('WebSocket server initialized');
}

export async function sendToDevice(deviceId: string, data: any) {
    const message = JSON.stringify(data);
    await redis.publish(`device-notifications:${deviceId}`, message);
} 