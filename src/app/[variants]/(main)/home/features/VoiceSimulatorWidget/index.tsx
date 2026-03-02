'use client';

import { Block, Button, Flexbox, Icon, Text } from '@lobehub/ui';
import { createStaticStyles, cssVar, keyframes } from 'antd-style';
import { Activity, Mic, PhoneCall, Zap } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const VOICE_SIMULATOR_AGENT_ID = 'voice-simulator-lpr';

const pulse = keyframes`
  0%, 100% { opacity: 0.2; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.05); }
`;

const styles = createStaticStyles(({ css, cssVar }) => ({
  badge: css`
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 9999px;
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
  `,
  card: css`
    border-radius: ${cssVar.borderRadiusLG};
    overflow: hidden;
    position: relative;
    background: linear-gradient(135deg, #312e81 0%, #4c1d95 50%, #1e293b 100%);
    padding: 1px;
  `,
  cardInner: css`
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
    padding: 24px;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;

    @media (min-width: 640px) {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
  `,
  iconWrap: css`
    position: relative;
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 15px rgba(99, 102, 241, 0.35);
  `,
  ping: css`
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.4);
    animation: ${pulse} 1.5s ease-in-out infinite;
  `,
  meta: css`
    display: flex;
    gap: 16px;
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextDescription};
  `,
  metaItem: css`
    display: flex;
    align-items: center;
    gap: 4px;
  `,
  left: css`
    display: flex;
    align-items: center;
    gap: 20px;
    flex: 1;
    min-width: 0;
  `,
  titleRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  `,
  cta: css`
    background: #4f46e6 !important;
    font-weight: 600;
    border-radius: ${cssVar.borderRadius} !important;

    &:hover {
      background: #6366f1 !important;
      box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
    }
  `,
}));

const VoiceSimulatorWidget = memo(() => {
  const navigate = useNavigate();

  const handleStartCall = useCallback(() => {
    navigate(`/voice-call?agentId=${VOICE_SIMULATOR_AGENT_ID}`);
  }, [navigate]);

  return (
    <Block className={styles.card} style={{ width: '100%' }}>
      <div className={styles.cardInner}>
        <Flexbox className={styles.left} gap={20} horizontal align={'center'}>
          <div className={styles.iconWrap}>
            <span className={styles.ping} />
            <Icon icon={Mic} size={28} style={{ color: '#818cf8' }} />
          </div>
          <Flexbox gap={4} style={{ minWidth: 0 }}>
            <div className={styles.titleRow}>
              <Text style={{ fontSize: 20, fontWeight: 700 }}>Голосовой тренажер ЛПР</Text>
              <span className={styles.badge}>LIVE</span>
            </div>
            <Text color={cssVar.colorTextDescription} style={{ fontSize: 13, maxWidth: 420 }}>
              Отработка возражений в реальном времени. ИИ-закупщик слушает ваш голос и отвечает
              моментально.
            </Text>
            <div className={styles.meta}>
              <span className={styles.metaItem}>
                <Activity size={14} style={{ color: '#34d399' }} />
                Сложность: Высокая
              </span>
              <span className={styles.metaItem}>
                <Zap size={14} style={{ color: '#fbbf24' }} />
                -200 кредитов
              </span>
            </div>
          </Flexbox>
        </Flexbox>
        <Button
          className={styles.cta}
          icon={<PhoneCall size={18} />}
          onClick={handleStartCall}
          size={'large'}
          type={'primary'}
        >
          Начать звонок
        </Button>
      </div>
    </Block>
  );
});

VoiceSimulatorWidget.displayName = 'VoiceSimulatorWidget';

export default VoiceSimulatorWidget;
