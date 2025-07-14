import express, { Request, Response, Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../utils/db.js';
import { DatabaseError } from 'pg';

const router: Router = express.Router();
const startingPath = '/mobile';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Register a new user
router.post('/register', async (req: Request, res: Response) => {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
        return res.status(400).send('Missing full_name, email, or password');
    }

    try {
        const password_hash = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            'INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING user_id, full_name, email',
            [full_name, email, password_hash]
        );

        res.status(201).json(newUser.rows[0]);
    } catch (error) {
        if (error instanceof DatabaseError && error.code === '23505') {
            return res.status(409).send('User with this email already exists');
        }
        console.error('Error registering user:', error);
        res.status(500).send('Internal server error');
    }
});

// Login with email and password
router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send('Missing email or password');
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user || !user.password_hash) {
            return res.status(401).send('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).send('Invalid credentials');
        }

        const token = jwt.sign({ userId: user.user_id }, JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({ token });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).send('Internal server error');
    }
});

// Google Sign-In
router.post('/google-signin', async (req: Request, res: Response) => {
    const { google_id, full_name, email } = req.body;

    if (!google_id || !full_name || !email) {
        return res.status(400).send('Missing google_id, full_name, or email');
    }

    try {
        let result = await pool.query('SELECT * FROM users WHERE google_id = $1', [google_id]);
        let user = result.rows[0];

        if (!user) {
            result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
            user = result.rows[0];

            if (user) {
                await pool.query('UPDATE users SET google_id = $1 WHERE user_id = $2', [google_id, user.user_id]);
            } else {
                const newUser = await pool.query(
                    'INSERT INTO users (full_name, email, google_id) VALUES ($1, $2, $3) RETURNING *',
                    [full_name, email, google_id]
                );
                user = newUser.rows[0];
            }
        }

        const token = jwt.sign({ userId: user.user_id }, JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({ token });
    } catch (error) {
        console.error('Error with Google Sign-In:', error);
        res.status(500).send('Internal server error');
    }
});

export default {
    startingPath,
    router,
};