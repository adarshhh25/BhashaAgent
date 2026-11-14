/**
 * prepare-extension.js
 *
 * Post-build script that copies Chrome Extension assets
 * (manifest.json, icons) into the dist/ output directory.
 *
 * Run via: npm run build:extension
 */

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');

// Ensure dist exists
if (!existsSync(dist)) {
  console.error('Error: dist/ directory not found. Run "vite build" first.');
  process.exit(1);
}

// Build standalone IIFE content script without ES module chunk imports
console.log('Building standalone content script (IIFE format)...');
await build({
  configFile: false,
  build: {
    emptyOutDir: false,
    outDir: dist,
    lib: {
      entry: resolve(root, 'src/content/index.ts'),
      name: 'BhashaAgentContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
console.log('✓ Built standalone IIFE content.js');

// Copy manifest.json
const manifestSrc = resolve(root, 'manifest.json');
const manifestDest = resolve(dist, 'manifest.json');
copyFileSync(manifestSrc, manifestDest);
console.log('✓ Copied manifest.json');

// Copy icons
const iconsSrc = resolve(root, 'public', 'icons');
const iconsDest = resolve(dist, 'icons');

if (existsSync(iconsSrc)) {
  mkdirSync(iconsDest, { recursive: true });
  cpSync(iconsSrc, iconsDest, { recursive: true });
  console.log('✓ Copied icons/');
} else {
  console.warn('⚠ No public/icons/ directory found — extension will lack icons.');
}

// Copy AudioWorklet processor module
const workletSrc = resolve(root, 'public', 'pcm-processor.js');
const workletDest = resolve(dist, 'pcm-processor.js');
if (existsSync(workletSrc)) {
  copyFileSync(workletSrc, workletDest);
  console.log('✓ Copied pcm-processor.js');
}

// Clean ES exports from content.js for Chrome classic content script compatibility
const contentJsPath = resolve(dist, 'content.js');
if (existsSync(contentJsPath)) {
  let contentJs = readFileSync(contentJsPath, 'utf8');
  contentJs = contentJs.replace(/export\s*\{[^}]*\}\s*;?/g, '');
  contentJs = contentJs.replace(/export\s+default\s+[^;]+;?/g, '');
  writeFileSync(contentJsPath, contentJs, 'utf8');
  console.log('✓ Cleaned ES exports from content.js for Chrome classic content script compatibility');
}

console.log('\n✓ Extension build ready at: dist/');
console.log('  Load as unpacked extension in chrome://extensions/');

