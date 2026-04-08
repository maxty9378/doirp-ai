// @ts-nocheck
import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';

const conn = new Client();

const localFile = path.join(process.cwd(), 'scripts', 'voice-call-ws-proxy.mts');
const remoteFile = '/var/www/doirp-ai/scripts/voice-call-ws-proxy.mts'; // Предполагаемый путь на сервере

console.log('Подключение к серверу 95.81.97.249...');

conn.on('ready', () => {
  console.log('✅ Подключено. Копирование файла...');
  
  conn.sftp((err, sftp) => {
    if (err) throw err;
    
    const readStream = fs.createReadStream(localFile);
    const writeStream = sftp.createWriteStream(remoteFile);
    
    writeStream.on('close', () => {
      console.log('✅ Файл скопирован. Перезапуск процесса...');
      
      // Ищем, как запущен прокси (pm2 или systemd)
      conn.exec('pm2 restart all || systemctl restart voice-proxy || pm2 restart doirp-proxy || echo "Не удалось найти команду перезапуска"', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
          console.log(`✅ Процесс завершен (код: ${code}).`);
          conn.end();
        }).on('data', (data) => {
          console.log('STDOUT: ' + data);
        }).stderr.on('data', (data) => {
          console.error('STDERR: ' + data);
        });
      });
    });

    writeStream.on('error', (err) => {
      console.error('❌ Ошибка записи:', err);
      // Возможно, директория другая, проверим
      conn.exec('find / -name "voice-call-ws-proxy.mts" 2>/dev/null', (err, stream) => {
         let output = '';
         stream.on('data', data => output += data.toString());
         stream.on('close', () => {
            console.log('Возможные пути файла на сервере:\n', output);
            conn.end();
         });
      });
    });

    readStream.pipe(writeStream);
  });

}).on('error', (err) => {
  console.error('❌ Ошибка подключения:', err);
}).connect({
  host: '95.81.97.249',
  port: 22,
  username: 'root',
  password: 'mkroot9378',
  algorithms: {
    serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa']
  }
});
