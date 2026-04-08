// @ts-nocheck
import { Client } from 'ssh2';

const conn = new Client();

console.log('Подключение к 45.91.238.46...');

conn.on('ready', () => {
  console.log('✅ Успешное подключение!');
  console.log('Выполняю поиск файла voice-call-ws-proxy.mts и запущенных процессов Node/PM2...');
  
  // Ищем pm2, процессы node, bun и сам файл скрипта
  const cmd = `
    echo "--- PM2 Status ---"
    pm2 status || echo "PM2 не установлен"
    echo "--- Docker PS ---"
    docker ps || echo "Docker не установлен"
    echo "--- Поиск файла voice-call-ws-proxy.mts ---"
    find / -name "voice-call-ws-proxy.mts" -not -path "*/node_modules/*" 2>/dev/null | head -n 5
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log(`\nКоманды выполнены (код: ${code})`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('❌ Ошибка подключения:', err.message);
}).connect({
  host: '45.91.238.46',
  port: 22,
  username: 'root',
  password: 'nXeKDDRRYy4-iL',
  algorithms: {
    serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa']
  }
});
