// @ts-nocheck
import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec('netstat -tuln', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).connect({
  host: '95.81.97.249',
  port: 22,
  username: 'root',
  password: 'mkroot9378',
  algorithms: {
    serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa']
  }
});
