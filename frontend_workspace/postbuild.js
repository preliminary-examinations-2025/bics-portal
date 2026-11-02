import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const athenaeumDir = path.resolve('dist', 'athenaeum');
const workspaceDir = path.resolve('dist', 'workspace');

for (const targetDir of [athenaeumDir, workspaceDir]) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Mirror assets folder
  const assetsDir = path.join(distDir, 'assets');
  const targetAssetsDir = path.join(targetDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    fs.cpSync(assetsDir, targetAssetsDir, { recursive: true });
  }

  // Mirror index.html
  const indexHtml = path.join(distDir, 'index.html');
  const targetIndexHtml = path.join(targetDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    fs.copyFileSync(indexHtml, targetIndexHtml);
  }

  // Mirror root icons and redirects
  const filesToMirror = ['favicon.ico', 'kata_icon.png', 'kata_logo.png', '_redirects'];
  for (const file of filesToMirror) {
    const src = path.join(distDir, file);
    const dest = path.join(targetDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
}

console.log('[postbuild] Successfully mirrored assets to dist/athenaeum/ and dist/workspace/ for Netlify.');
