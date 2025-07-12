import express, { Request, Response, Router } from 'express';
import crypto from 'node:crypto';
import { pool, redis } from '../utils/db.js';
import { DatabaseError } from 'pg';

interface Device {
    device_id: string;
    public_key: string;
    registered_at: Date;
    last_seen_at: Date | null;
    key_version: number;
}

const router: Router = express.Router();
const startingPath = '/device';

/**
 * @swagger
 * /device/register:
 *   post:
 *     summary: Register a new device
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               device_id:
 *                 type: string
 *               public_key:
 *                 type: string
 *     responses:
 *       201:
 *         description: Device registered successfully
 *       400:
 *         description: Missing device_id or public_key
 *       409:
 *         description: Device with this ID already exists
 *       500:
 *         description: Internal server error
 */
interface RegisterRequestBody {
    device_id: string;
    public_key: string;
}

router.post('/register', async (req: Request<{}, {}, RegisterRequestBody>, res: Response) => {
    const { device_id, public_key } = req.body;

    if (!device_id || !public_key) {
        return res.status(400).send('Missing device_id or public_key');
    }

    try {
        await pool.query(
            'INSERT INTO devices (device_id, public_key) VALUES ($1, $2)',
            [device_id, public_key]
        );
        res.status(201).send('Device registered successfully');
    } catch (error) {
        if (error instanceof DatabaseError && error.code === '23505') { // unique_violation
            return res.status(409).send('Device with this ID already exists');
        }
        console.error('Error registering device:', error);
        res.status(500).send('Internal server error');
    }
});

/**
 * @swagger
 * /device/auth/request:
 *   post:
 *     summary: Request an authentication challenge
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               device_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Authentication challenge
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 challenge:
 *                   type: string
 *       400:
 *         description: Missing device_id
 *       404:
 *         description: Device not found
 *       500:
 *         description: Internal server error
 */
interface AuthRequestRequestBody {
    device_id: string;
}

router.post('/auth/request', async (req: Request<{}, {}, AuthRequestRequestBody>, res: Response) => {
    const { device_id } = req.body;

    if (!device_id) {
        return res.status(400).send('Missing device_id');
    }

    try {
        const { rows } = await pool.query<Device>('SELECT * FROM devices WHERE device_id = $1', [device_id]);
        if (rows.length === 0) {
            return res.status(404).send('Device not found');
        }

        const challenge = crypto.randomBytes(32).toString('hex');
        await redis.set(`challenge:${device_id}`, challenge, 'EX', 60); // Expires in 60 seconds

        res.status(200).json({ challenge });
    } catch (error) {
        console.error('Error requesting challenge:', error);
        res.status(500).send('Internal server error');
    }
});

/**
 * @swagger
 * /device/auth/verify:
 *   post:
 *     summary: Verify a signed challenge
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               device_id:
 *                 type: string
 *               signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Authentication successful
 *       400:
 *         description: Missing device_id or signature
 *       401:
 *         description: Invalid signature or challenge expired
 *       404:
 *         description: Device not found
 *       500:
 *         description: Internal server error
 */
interface AuthVerifyRequestBody {
    device_id: string;
    signature: string;
}

router.post('/auth/verify', async (req: Request<{}, {}, AuthVerifyRequestBody>, res: Response) => {
    const { device_id, signature } = req.body;

    if (!device_id || !signature) {
        return res.status(400).send('Missing device_id or signature');
    }

    try {
        const challenge = await redis.get(`challenge:${device_id}`);
        if (!challenge) {
            return res.status(401).send('Invalid signature or challenge expired');
        }

        const { rows } = await pool.query<{ public_key: string }>('SELECT public_key FROM devices WHERE device_id = $1', [device_id]);
        if (rows.length === 0) {
            return res.status(404).send('Device not found');
        }
        const { public_key } = rows[0];

        const verify = crypto.createVerify('SHA256');
        verify.update(challenge);
        const isVerified = verify.verify(public_key, signature, 'base64');

        if (isVerified) {
            await redis.del(`challenge:${device_id}`);
            await pool.query('UPDATE devices SET last_seen_at = NOW() WHERE device_id = $1', [device_id]);
            // Here you would typically issue a session token (e.g., JWT)
            res.status(200).send('Authentication successful');
        } else {
            res.status(401).send('Invalid signature');
        }
    } catch (error) {
        console.error('Error verifying signature:', error);
        res.status(500).send('Internal server error');
    }
});

/**
 * @swagger
 * /device/rotate-key:
 *   post:
 *     summary: Rotate the public key for a device
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               device_id:
 *                 type: string
 *               new_public_key:
 *                 type: string
 *               signature_of_new_key:
 *                 type: string
 *     responses:
 *       200:
 *         description: Key rotated successfully
 *       400:
 *         description: Missing parameters
 *       401:
 *         description: Invalid signature
 *       404:
 *         description: Device not found
 *       500:
 *         description: Internal server error
 */
interface RotateKeyRequestBody {
    device_id: string;
    new_public_key: string;
    signature_of_new_key: string;
}

router.post('/rotate-key', async (req: Request<{}, {}, RotateKeyRequestBody>, res: Response) => {
    const { device_id, new_public_key, signature_of_new_key } = req.body;

    if (!device_id || !new_public_key || !signature_of_new_key) {
        return res.status(400).send('Missing device_id, new_public_key, or signature_of_new_key');
    }

    try {
        const { rows } = await pool.query<{ public_key: string }>('SELECT public_key FROM devices WHERE device_id = $1', [device_id]);
        if (rows.length === 0) {
            return res.status(404).send('Device not found');
        }
        const { public_key: old_public_key } = rows[0];

        const verify = crypto.createVerify('SHA256');
        verify.update(new_public_key);
        const isVerified = verify.verify(old_public_key, signature_of_new_key, 'base64');

        if (isVerified) {
            await pool.query(
                'UPDATE devices SET public_key = $1, key_version = key_version + 1 WHERE device_id = $2',
                [new_public_key, device_id]
            );
            res.status(200).send('Key rotated successfully');
        } else {
            res.status(401).send('Invalid signature');
        }
    } catch (error) {
        console.error('Error rotating key:', error);
        res.status(500).send('Internal server error');
    }
});

export default {
    startingPath,
    router,
}; 