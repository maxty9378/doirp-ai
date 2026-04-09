// @ts-nocheck
import { Client } from 'ssh2';

import { resolveVoiceGatewaySshConfig } from './_localAccess.mjs';

const target = await resolveVoiceGatewaySshConfig();
const conn = new Client();

console.log(`Connecting to ${target.host}...`);

conn
  .on('ready', () => {
    console.log('Connected. Looking for voice-call-ws-proxy runtime...');

    const cmd = `
      echo "--- PM2 Status ---"
      pm2 status || echo "PM2 is not installed"
      echo "--- Docker PS ---"
      docker ps || echo "Docker is not installed"
      echo "--- voice-call-ws-proxy.mts locations ---"
      find / -name "voice-call-ws-proxy.mts" -not -path "*/node_modules/*" 2>/dev/null | head -n 5
    `;

    conn.exec(cmd, (error, stream) => {
      if (error) throw error;

      stream
        .on('close', (code) => {
          console.log(`Command finished with code ${code}`);
          conn.end();
        })
        .on('data', (data) => {
          process.stdout.write(data.toString());
        })
        .stderr.on('data', (data) => {
          process.stderr.write(data.toString());
        });
    });
  })
  .on('error', (error) => {
    console.error('Connection error:', error.message);
  })
  .connect({
    algorithms: {
      serverHostKey: [
        'ssh-ed25519',
        'ecdsa-sha2-nistp256',
        'rsa-sha2-512',
        'rsa-sha2-256',
        'ssh-rsa',
      ],
    },
    host: target.host,
    password: target.password,
    port: target.port,
    username: target.username,
  });
