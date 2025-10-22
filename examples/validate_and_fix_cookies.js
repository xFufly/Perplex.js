#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const INPUT = process.argv[2] || path.resolve(process.cwd(), 'perplexity_cookies.json');
const OUTPUT = process.argv[3] || path.resolve(process.cwd(), 'perplexity_cookies_fixed.json');

function isCookieArray(obj) {
  return Array.isArray(obj) && obj.every(c => c && typeof c.name === 'string' && typeof c.value === 'string');
}

function convertFromObjectMap(obj) {
  // obj is a mapping name->value
  return Object.entries(obj).map(([name, value]) => ({ name, value: String(value), domain: 'www.perplexity.ai' }));
}

function parseCookieHeader(header) {
  // parse a Cookie header string like 'a=1; b=2' -> array
  return header.split(';').map(p => p.trim()).filter(Boolean).map(pair => {
    const idx = pair.indexOf('=');
    const name = idx === -1 ? pair : pair.slice(0, idx);
    const value = idx === -1 ? '' : pair.slice(idx+1);
    return { name, value, domain: 'www.perplexity.ai' };
  });
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error('Input file not found:', INPUT);
    process.exit(2);
  }

  const raw = fs.readFileSync(INPUT, 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch (e) { console.error('Invalid JSON:', e.message); process.exit(2); }

  // If already in correct format
  if (isCookieArray(data)) {
    console.log('File already a cookie array with name/value pairs. Writing to', OUTPUT);
    fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2));
    process.exit(0);
  }

  // Heuristics: if object has 'cookies' key that's an object mapping
  if (data && typeof data === 'object') {
    if (data.cookies && typeof data.cookies === 'object' && !Array.isArray(data.cookies)) {
      const arr = convertFromObjectMap(data.cookies);
      fs.writeFileSync(OUTPUT, JSON.stringify(arr, null, 2));
      console.log('Converted cookies object -> array, wrote to', OUTPUT);
      process.exit(0);
    }

    // If headers.Cookie exists
    if (data.headers && data.headers.Cookie) {
      const arr = parseCookieHeader(data.headers.Cookie);
      fs.writeFileSync(OUTPUT, JSON.stringify(arr, null, 2));
      console.log('Parsed Cookie header into array, wrote to', OUTPUT);
      process.exit(0);
    }
  }

  console.error('Unrecognized cookie file structure. Expected either an array of {name,value} or an object with a `cookies` map or headers.Cookie string.');
  process.exit(2);
}

main();
