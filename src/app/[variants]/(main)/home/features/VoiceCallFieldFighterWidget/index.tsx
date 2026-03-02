'use client';

import { Block, Button, Flexbox, Icon, Text } from '@lobehub/ui';
import { createStaticStyles, cssVar, keyframes } from 'antd-style';
import { Mic, PhoneCall, Zap } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const FIELD_FIGHTER_AGENT_ID = 'training-tp-price-objection';

const pulse = keyframes`
  0%, 100% { opacity: 0.2; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.05); }
`;

const styles = createStaticStyles(({ css, cssVar }) => ({
  badge: css`
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 9999px;
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
  `,
  card: css`
    border-radius: ${cssVar.borderRadiusLG};
    overflow: hidden;
    position: relative;
    background: linear-gradient(135deg, #064e3b 0%, #047857 50%, #0f766e 100%);
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
    background: rgba(16, 185, 129, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 15px rgba(16, 185, 129, 0.35);
  `,
  ping: css`
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(16, 185, 129, 0.4);
    animation: ${pulse} 1.5s ease-in-out infinite;
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
    background: #059669 !important;
    font-weight: 600;
    border-radius: ${cssVar.borderRadius} !important;

    &:hover {
      background: #10b981 !important;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.4);
    }
  `,
}));

const VoiceCallFieldFighterWidget = memo(() => {
  const navigate = useNavigate();

  const handleStartCall = useCallback(() => {
    navigate(`/voice-call?agentId=${FIELD_FIGHTER_AGENT_ID}`);
  }, [navigate]);

  return (
    <Block className={styles.card} style={{ width: '100%' }}>
      <div className={styles.cardInner}>
        <Flexbox className={styles.left} gap={20} horizontal align={'center'}>
          <div className={styles.iconWrap}>
            <span className={styles.ping} />
            <Icon icon={Mic} size={28} style={{ color: '#10b981' }} />
          </div>
          <Flexbox gap={4} style={{ minWidth: 0 }}>
            <div className={styles.titleRow}>
              <Text style={{ fontSize: 20, fontWeight: 700 }}>Полевой боец: Дорого</Text>
              <span className={styles.badge}>LIVE</span>
            </div>
            <Text color={cssVar.colorTextDescription} style={{ fontSize: 13, maxWidth: 420 }}>
              Голосовой тренажер по отработке возражения «Дорого / у конкурентов дешевле». Говорите
              с ИИ в реальном времени.
            </Text>
            <Flexbox gap={16} style={{ marginTop: 8 }}>
              <Flexbox align={'center'} gap={4} style={{ fontSize: 12, color: 'var(--colorTextDescription)' }}>
                <Zap size={14} style={{ color: '#fbbf24' }} />
                ТП, возражения
              </Flexbox>
            </Flexbox>
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

VoiceCallFieldFighterWidget.displayName = 'VoiceCallFieldFighterWidget';

export default VoiceCallFieldFighterWidget;
