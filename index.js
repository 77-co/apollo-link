import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
process.env.PORT = port;

app.set("trust proxy", process.env.NODE_ENV === "production")

process.__dirname = __dirname;

app.use(express.static(path.join(__dirname, 'public')));

// Use routers from ./routers
fs.readdir(path.join(__dirname, 'routers'), (err, files) => {
    files.forEach(async file => {
        if (file.endsWith('.js')) {
            const { default: { startingPath, router } } = await import(pathToFileURL(path.join(__dirname, 'routers', file)));
            app.use(startingPath, router);
        }
    });
});

// Listening on specified port
app.listen(port, () => {
    console.log(`Listening on ${port}`);
});
