# Голосовой WebSocket-прокси на своём VPS

Сайт на Vercel (HTTPS) может подключаться к прокси только по **`wss://`** (TLS). Один IP без домена и сертификата для браузера обычно **не подходит** — нужен домен (поддомен) с A-записью на `45.91.238.46`.

## Безопасность

- Пароль root, который мог попасть в переписку, **смените** после настройки: `passwd`.
- Не храните пароли в открытом виде в репозитории.

## Что открыть на сервере

- **22** (SSH) — уже есть.
- **80** и **443** — для Caddy (Let's Encrypt) и `wss://`.
- Порт **3011** можно не открывать наружу: слушает только localhost, наружу идёт трафик через Caddy на 443.

## 1. DNS

Создайте поддомен, например `voice.doirp-ai.ru` или `gemini-ws.ваш-домен.ru`:

| Тип | Имя | Значение   |
|-----|-----|------------|
| A   | voice | 45.91.238.46 |

Подождите распространения DNS (часто 5–30 минут).

## 2. Подключение по SSH

```bash
ssh root@45.91.238.46
```

## 3. Firewall (если используется ufw)

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable   # если ещё не включён
```

## 4. Bun и репозиторий

```bash
apt update && apt install -y curl git
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc   # или откройте новую сессию SSH

cd /opt
git clone https://github.com/maxty9378/doirp-ai.git lobe-voice-proxy
cd lobe-voice-proxy
bun install
```

(Если репозиторий приватный — клонируйте по SSH-ключу или скопируйте только `scripts/voice-call-ws-proxy.mts` и минимальный `package.json` с зависимостями `ws`, `https-proxy-agent`, `socks-proxy-agent`.)

## 5. Переменные окружения

Создайте файл **только на сервере** (не коммитьте):

```bash
nano /opt/lobe-voice-proxy/.env.voice-proxy
```

Пример:

```env
VOICE_CALL_WS_PROXY_PORT=3011
# Исходящий прокси до Google (обязательно, если регион сервера режется):
HTTPS_PROXY=http://USER:PASS@HOST:PORT
```

Скрипт уже содержит fallback-список прокси; при наличии `HTTPS_PROXY` он идёт первым в цепочке.

## 6. systemd — автозапуск прокси

```bash
nano /etc/systemd/system/voice-call-ws-proxy.service
```

Вставьте (путь к `bun` проверьте: `which bun`):

```ini
[Unit]
Description=Voice call WebSocket proxy (Gemini Live)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/lobe-voice-proxy
EnvironmentFile=/opt/lobe-voice-proxy/.env.voice-proxy
ExecStart=/root/.bun/bin/bun run scripts/voice-call-ws-proxy.mts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Если Bun установлен в другом месте, замените `ExecStart` на полный путь к `bun`.

```bash
systemctl daemon-reload
systemctl enable voice-call-ws-proxy
systemctl start voice-call-ws-proxy
systemctl status voice-call-ws-proxy
```

Проверка локально на сервере:

```bash
curl -s http://127.0.0.1:3011 | head -1
# Должен ответить текст про WebSocket proxy
```

## 7. Caddy — HTTPS и WSS

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

```bash
nano /etc/caddy/Caddyfile
```

Минимальный вариант (замените домен):

```caddy
voice.ВАШ-ДОМЕН.ru {
    reverse_proxy 127.0.0.1:3011
}
```

```bash
systemctl reload caddy
```

Caddy сам получит сертификат Let's Encrypt.

## 8. Vercel

В настройках проекта → Environment Variables:

```text
VOICE_CALL_WS_PROXY_URL=wss://voice.ВАШ-ДОМЕН.ru
```

Пересоберите деплой. В ответе `/api/voice-call/config` появится `geminiWsUrl`, клиент пойдёт на ваш VPS.

## Проверка с ноутбука

В DevTools → Network → WS: при звонке должен быть запрос к `wss://voice.ваш-домен.ru/?key=...`, не к `generativelanguage.googleapis.com`.

## Частые проблемы

| Симптом | Что сделать |
|---------|-------------|
| Caddy не выдаёт сертификат | Порт 80 снаружи должен доходить до сервера; DNS A на верный IP |
| 502 от Caddy | `systemctl status voice-call-ws-proxy` — прокси слушает 3011 |
| 1007 от Google | На сервере настроить рабочий `HTTPS_PROXY` / fallback-прокси до Gemini |

---

**Итог:** я не запускаю команды на вашем сервере за вас; скопируйте шаги выше после `ssh root@45.91.238.46`. Если пришлёте **только поддомен** (без паролей), можно сузить инструкцию под ваш домен.
