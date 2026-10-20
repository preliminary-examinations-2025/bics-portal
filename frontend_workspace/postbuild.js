import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const workspaceDir = path.resolve('dist', 'workspace');

if (!fs.existsSync(workspaceDir)) {
  fs.mkdirSync(workspaceDir, { recursive: true });
}

// Mirror assets folder into dist/workspace/assets
const assetsDir = path.join(distDir, 'assets');
const targetAssetsDir = path.join(workspaceDir, 'assets');
if (fs.existsSync(assetsDir)) {
  fs.cpSync(assetsDir, targetAssetsDir, { recursive: true });
}

// Mirror index.html into dist/workspace/index.html
const indexHtml = path.join(distDir, 'index.html');
const targetIndexHtml = path.join(workspaceDir, 'index.html');
if (fs.existsSync(indexHtml)) {
  fs.copyFileSync(indexHtml, targetIndexHtml);
}

console.log('[postbuild] Successfully mirrored assets to dist/workspace/ for Netlify.');
