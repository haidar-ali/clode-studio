#!/usr/bin/env node

/**
 * Check if Nuxt build is needed by comparing source and output timestamps
 */

import fs from 'fs';
import path from 'path';

const OUTPUT_FILE = '.output/server/index.mjs';
const SOURCE_INDICATORS = [
  'pages',
  'components', 
  'composables',
  'stores',
  'services',
  'nuxt.config.ts',
  'app.vue'
];

function getLatestModTime(dir, extensions = ['.vue', '.ts', '.js', '.css']) {
  let latest = 0;
  
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        latest = Math.max(latest, getLatestModTime(filePath, extensions));
      } else if (stat.isFile()) {
        const ext = path.extname(file);
        if (extensions.includes(ext)) {
          latest = Math.max(latest, stat.mtime.getTime());
        }
      }
    }
  } catch (e) {
    // Directory doesn't exist
  }
  
  return latest;
}

// Check if output exists
if (!fs.existsSync(OUTPUT_FILE)) {
  
  process.exit(1); // Build needed
}

// Get output timestamp
const outputTime = fs.statSync(OUTPUT_FILE).mtime.getTime();

// Check all source directories
let latestSourceTime = 0;
for (const source of SOURCE_INDICATORS) {
  if (fs.existsSync(source)) {
    const stat = fs.statSync(source);
    if (stat.isDirectory()) {
      latestSourceTime = Math.max(latestSourceTime, getLatestModTime(source));
    } else {
      latestSourceTime = Math.max(latestSourceTime, stat.mtime.getTime());
    }
  }
}

// Compare timestamps
if (latestSourceTime > outputTime) {
  
  process.exit(1); // Build needed
} else {
  
  process.exit(0); // Build not needed
}