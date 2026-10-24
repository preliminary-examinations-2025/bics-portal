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

// Mirror root icons and redirects into dist/workspace/
const filesToMirror = ['favicon.ico', 'kata_icon.png', 'kata_logo.png', '_redirects'];
for (const file of filesToMirror) {
  const src = path.join(distDir, file);
  const dest = path.join(workspaceDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

console.log('[postbuild] Successfully mirrored assets to dist/workspace/ for Netlify.');
