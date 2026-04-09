// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

import { Client } from 'ssh2';

import { resolveVpnNodeSshConfig } from './_localAccess.mjs';

const target = await resolveVpnNodeSshConfig();
const conn = new Client();

const localFile = path.join(process.cwd(), 'scripts', 'voice-call-ws-proxy.mts');
const remoteFile = '/var/www/doirp-ai/scripts/voice-call-ws-proxy.mts';

console.log(`Connecting to ${target.host}...`);

conn
  .on('ready', () => {
    console.log('Connected. Uploading proxy script...');

    conn.sftp((error, sftp) => {
      if (error) throw error;

      const readStream = fs.createReadStream(localFile);
      const writeStream = sftp.createWriteStream(remoteFile);

      writeStream.on('close', () => {
        console.log('Upload finished. Restarting remote service...');

        conn.exec(
          'pm2 restart all || systemctl restart voice-proxy || pm2 restart doirp-proxy || echo "No restart command matched"',
          (execError, stream) => {
            if (execError) throw execError;

            stream
              .on('close', (code) => {
                console.log(`Remote restart command finished with code ${code}`);
                conn.end();
              })
              .on('data', (data) => {
                console.log(`STDOUT: ${data}`);
              })
              .stderr.on('data', (data) => {
                console.error(`STDERR: ${data}`);
              });
          },
        );
      });

      writeStream.on('error', (writeError) => {
        console.error('Remote write error:', writeError);

        conn.exec('find / -name "voice-call-ws-proxy.mts" 2>/dev/null', (findError, stream) => {
          if (findError) throw findError;

          let output = '';
          stream.on('data', (data) => {
            output += data.toString();
          });
          stream.on('close', () => {
            console.log(`Possible remote locations:\n${output}`);
            conn.end();
          });
        });
      });

      readStream.pipe(writeStream);
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
