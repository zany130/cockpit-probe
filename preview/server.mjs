#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import esbuild from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const port = Number(process.env.PREVIEW_PORT || 43173);

if (!fs.existsSync(path.join(root, 'pkg/lib'))) {
    console.error('pkg/lib is missing. Run `make` once so Cockpit shared files are checked out.');
    process.exit(1);
}

const context = await esbuild.context({
    bundle: true,
    sourcemap: true,
    entryPoints: [path.join(root, 'src/index.tsx')],
    outdir: path.join(here, 'dist'),
    loader: { '.js': 'jsx' },
    nodePaths: [path.join(root, 'pkg/lib')],
    external: ['*.woff', '*.woff2', '*.jpg', '*.svg', '../../assets*'],
    alias: {
        cockpit: path.join(here, 'mock-cockpit.ts'),
        'cockpit-dark-theme': path.join(here, 'empty.ts'),
    },
    plugins: [
        sassPlugin({
            loadPaths: [path.join(root, 'pkg/lib'), path.join(root, 'node_modules')],
            filter: /\.scss/,
            quietDeps: true,
        }),
    ],
});

await context.rebuild();

const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Hardware Probe preview</title>
    <link rel="stylesheet" href="/index.css">
</head>
<body>
    <div id="app"></div>
    <script src="/index.js"></script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
    }

    const filePath = path.join(here, 'dist', path.basename(url.pathname));
    if (!filePath.startsWith(path.join(here, 'dist')) || !fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
    console.log(`Hardware Probe preview: http://127.0.0.1:${port}/`);
    console.log('Mock states: ?state=available|unavailable|permission-denied|timeout|error|loading|admin-denied');
});
