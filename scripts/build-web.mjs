// Copies the game into www/ for the Android app and writes js/config.js
// from the FIREBASE_API_KEY and FIREBASE_PROJECT_ID environment variables.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
for (const file of ['index.html', 'style.css']) cpSync(file, `www/${file}`);
cpSync('js', 'www/js', { recursive: true });

const config = {
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
  },
};
writeFileSync('www/js/config.js', `window.QUEENS_CONFIG = ${JSON.stringify(config, null, 2)};\n`);

const online = config.firebase.apiKey && config.firebase.projectId;
console.log(`Built www/. Online leaderboard: ${online ? 'on (' + config.firebase.projectId + ')' : 'off, no Firebase settings found'}.`);
