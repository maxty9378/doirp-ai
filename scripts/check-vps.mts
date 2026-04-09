// @ts-nocheck
import { Client } from 'ssh2';

import { resolveVpnNodeSshConfig } from './_localAccess.mjs';

const target = await resolveVpnNodeSshConfig();
const conn = new Client();

conn
  .on('ready', () => {
    console.log('SSH client is ready');

    conn.exec('netstat -tuln', (error, stream) => {
      if (error) throw error;

      stream
        .on('close', (code, signal) => {
          console.log(`Command closed with code ${code}, signal ${signal}`);
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
    console.error('Connection error:', error);
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
