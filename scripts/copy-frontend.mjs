#!/usr/bin/env node
import { cpSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '..', '..', 'frontend', 'dist');
const dest = path.join(__dirname, '..', 'public');

if (!existsSync(src)) {
  console.error('Pasta frontend/dist não encontrada. Rode "npm run build" no frontend primeiro.');
  process.exit(1);
}
if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('Frontend copiado para backend/public');
