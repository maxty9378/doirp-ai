'use client';

import { datadogLogs } from '@datadog/browser-logs';
import { useRoomContext } from '@livekit/components-react';
import {
  LogLevel,
  type RemoteTrackPublication,
  setLogExtension,
  setLogLevel,
} from 'livekit-client';
import * as React from 'react';
import { tinykeys } from 'tinykeys';

import styles from './Debug.module.css';

const useDebugMode = ({ logLevel }: { logLevel?: LogLevel }) => {
  const room = useRoomContext();

  React.useEffect(() => {
    setLogLevel(logLevel ?? 'debug');

    if (process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN && process.env.NEXT_PUBLIC_DATADOG_SITE) {
      datadogLogs.init({
        clientToken: process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN,
        forwardErrorsToLogs: true,
        sessionSampleRate: 100,
        site: process.env.NEXT_PUBLIC_DATADOG_SITE,
      });

      setLogExtension((level, msg, context) => {
        switch (level) {
          case LogLevel.debug: {
            datadogLogs.logger.debug(msg, context);
            break;
          }
          case LogLevel.info: {
            datadogLogs.logger.info(msg, context);
            break;
          }
          case LogLevel.warn: {
            datadogLogs.logger.warn(msg, context);
            break;
          }
          case LogLevel.error: {
            datadogLogs.logger.error(msg, context);
            break;
          }
          default: {
            break;
          }
        }
      });
    }

    (window as any).__lk_room = room;

    return () => {
      (window as any).__lk_room = undefined;
    };
  }, [logLevel, room]);
};

export const DebugMode = ({ logLevel }: { logLevel?: LogLevel }) => {
  const room = useRoomContext();
  const [isOpen, setIsOpen] = React.useState(false);
  const [, setRender] = React.useState({});
  const [roomSid, setRoomSid] = React.useState('');

  React.useEffect(() => {
    room.getSid().then(setRoomSid);
  }, [room]);

  useDebugMode({ logLevel });

  React.useEffect(() => {
    const unsubscribe = tinykeys(window, {
      'Shift+D': () => {
        setIsOpen((open) => !open);
      },
    });

    const interval = setInterval(() => {
      setRender({});
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  if (typeof window === 'undefined' || !isOpen) {
    return null;
  }

  const handleSimulate = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    if (!value) return;

    event.target.value = '';
    (room as any).simulateScenario?.(value);
  };

  const lp = room.localParticipant;

  return (
    <div className={styles.overlay}>
      <section>
        <h3>
          Информация о комнате {room.name}: {roomSid}
        </h3>
      </section>

      <div style={{ marginBottom: 12 }}>
        <label htmlFor="meet-debug-simulate">Симулировать сценарий</label>
        <select defaultValue="" id="meet-debug-simulate" onChange={handleSimulate}>
          <option value="">Выберите</option>
          <option value="signal-reconnect">Переподключение сигналинга</option>
          <option value="node-failure">Сбой узла</option>
          <option value="server-leave">Принудительный выход с сервера</option>
          <option value="migration">Миграция</option>
        </select>
      </div>

      <details open>
        <summary>
          <b>Локальный участник: {lp.identity}</b>
        </summary>
        <details open className={styles.detailsSection}>
          <summary>
            <b>Опубликованные дорожки</b>
          </summary>
          <div>
            {Array.from(lp.trackPublications.values()).map((t) => (
              <div key={t.trackSid ?? t.source.toString()}>
                <div>
                  <i>
                    {translateTrackSource(t.source.toString())} <span>{t.trackSid}</span>
                  </i>
                </div>
                <table>
                  <tbody>
                    <tr>
                      <td>Тип</td>
                      <td>
                        {translateTrackKind(t.kind)}{' '}
                        {t.kind === 'video' && (
                          <span>
                            {t.track?.dimensions?.width}x{t.track?.dimensions?.height}
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td>Битрейт</td>
                      <td>{Math.ceil((t.track?.currentBitrate ?? 0) / 1000)} kbps</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </details>
        <details open className={styles.detailsSection}>
          <summary>
            <b>Разрешения</b>
          </summary>
          <table>
            <tbody>
              {lp.permissions &&
                Object.entries(lp.permissions).map(([key, val]) => (
                  <tr key={key}>
                    <td>{translatePermissionKey(key)}</td>
                    <td>{key !== 'canPublishSources' ? String(val) : (val as any[]).join(', ')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      </details>

      <details>
        <summary>
          <b>Удалённые участники</b>
        </summary>
        {Array.from(room.remoteParticipants.values()).map((p) => (
          <details className={styles.detailsSection} key={p.sid}>
            <summary>
              <b>{p.identity}</b>
            </summary>
            <div>
              {Array.from(p.trackPublications.values()).map((t) => (
                <div key={t.trackSid ?? `${p.sid}-${t.source.toString()}`}>
                  <div>
                    <i>
                      {translateTrackSource(t.source.toString())} <span>{t.trackSid}</span>
                    </i>
                  </div>
                  <table>
                    <tbody>
                      <tr>
                        <td>Тип</td>
                        <td>
                          {translateTrackKind(t.kind)}{' '}
                          {t.kind === 'video' && (
                            <span>
                              {t.dimensions?.width}x{t.dimensions?.height}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td>Статус</td>
                        <td>{trackStatus(t)}</td>
                      </tr>
                      {t.track && (
                        <tr>
                          <td>Битрейт</td>
                          <td>{Math.ceil(t.track.currentBitrate / 1000)} kbps</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </details>
        ))}
      </details>
    </div>
  );
};

function trackStatus(t: RemoteTrackPublication): string {
  if (t.isSubscribed) {
    return t.isEnabled ? 'включено' : 'выключено';
  }

  return 'не подписан';
}

function translateTrackKind(kind: string): string {
  switch (kind) {
    case 'audio': {
      return 'аудио';
    }
    case 'video': {
      return 'видео';
    }
    default: {
      return kind;
    }
  }
}

function translateTrackSource(source: string): string {
  switch (source) {
    case 'camera': {
      return 'камера';
    }
    case 'microphone': {
      return 'микрофон';
    }
    case 'screen_share': {
      return 'демонстрация экрана';
    }
    case 'screen_share_audio': {
      return 'звук демонстрации';
    }
    default: {
      return source;
    }
  }
}

function translatePermissionKey(key: string): string {
  switch (key) {
    case 'canPublish': {
      return 'Публикация';
    }
    case 'canSubscribe': {
      return 'Подписка';
    }
    case 'canPublishData': {
      return 'Публикация данных';
    }
    case 'canPublishSources': {
      return 'Разрешённые источники публикации';
    }
    case 'hidden': {
      return 'Скрытый участник';
    }
    case 'recorder': {
      return 'Рекордер';
    }
    case 'canUpdateOwnMetadata': {
      return 'Изменение своих метаданных';
    }
    case 'agent': {
      return 'Агент';
    }
    default: {
      return key;
    }
  }
}
