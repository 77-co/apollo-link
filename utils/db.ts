import pg, { Pool } from 'pg';
import { Redis } from 'ioredis';

// It's recommended to use environment variables for connection strings.
// Make sure you have POSTGRES_URL and REDIS_URL in your .env file.
if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not set in the environment variables.");
}

if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not set in the environment variables.");
}


const { Pool: PGPool } = pg; // Keep original in case of name clash

const pool: Pool = new pg.Pool({
    connectionString: process.env.POSTGRES_URL,
});

const redis = new Redis(process.env.REDIS_URL);

export { pool, redis }; 