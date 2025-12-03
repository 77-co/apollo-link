import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import http from 'node:http';
import { initializeWebSocket } from './services/websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;
process.env.PORT = String(port);

app.set("trust proxy", process.env.NODE_ENV === "production");

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check endpoint
app.get('/', (req, res) => {
    res.status(200).send('OK');
});

// Use routers from ./routers
const routersPath = path.join(__dirname, 'routers');
fs.readdir(routersPath, (err, files) => {
    if (err) {
        console.error("Error reading routers directory:", err);
        return;
    }

    files.forEach(async (file) => {
        if (file.endsWith('.js')) { // After compilation, files will be .js
            try {
                // Convert Windows path to proper file URL for ESM import
                const routerPath = path.join(routersPath, file);
                const routerUrl = `file://${routerPath.replace(/\\/g, '/')}`;
                const routerModule = await import(routerUrl);
                const { startingPath, router } = routerModule.default;
                if (startingPath && router) {
                    app.use(startingPath, router);
                }
            } catch (importError) {
                console.error(`Error importing router from ${file}:`, importError);
            }
        }
    });
});

initializeWebSocket(server);

// Listening on specified port
server.listen(port, () => {
    console.log(`Listening on ${port}`);
});
