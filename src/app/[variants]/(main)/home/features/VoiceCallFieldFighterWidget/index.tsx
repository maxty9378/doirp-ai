'use client';

import { Block, Button, Flexbox, Icon, Text } from '@lobehub/ui';
import { createStaticStyles, cssVar, keyframes } from 'antd-style';
import { Mic, PhoneCall, Zap } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const FIELD_FIGHTER_AGENT_ID = 'training-tp-price-objection';
const FIELD_FIGHTER_COVER =
  '/images/voice-call/gemini-image-2_A_high-resolution_photo_from_a_cinematic_banner_angle._Inside_a_modern_well-lit_-0.jpg';

const pulse = keyframes`
  0%, 100% { opacity: 0.2; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.05); }
`;

const styles = createStaticStyles(({ css, cssVar }) => ({
  badge: css`
    padding-block: 2px;
    padding-inline: 8px;
    border: 1px solid rgb(34 197 94 / 30%);
    border-radius: 9999px;

    font-size: 11px;
    font-weight: 600;
    color: #22c55e;

    background: rgb(34 197 94 / 15%);
  `,
  card: css`
    position: relative;

    overflow: hidden;

    padding: 1px;
    border-radius: ${cssVar.borderRadiusLG};

    background: linear-gradient(135deg, #064e3b 0%, #047857 50%, #0f766e 100%);
  `,
  cardInner: css`
    position: relative;

    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: flex-start;

    padding: 18px;
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};

    @media (width >= 640px) {
      flex-direction: row;
      gap: 18px;
      align-items: center;
      justify-content: space-between;

      padding-block: 20px;
      padding-inline: 22px;
    }
  `,
  left: css`
    display: flex;
    flex: 1;
    gap: 14px;
    align-items: center;

    min-width: 0;
  `,
  coverThumb: css`
    position: relative;

    overflow: hidden;
    flex-shrink: 0;

    width: 82px;
    height: 82px;
    border: 1px solid rgb(255 255 255 / 20%);
    border-radius: 16px;

    background-position: center;
    background-size: cover;
    box-shadow: 0 0 15px rgb(16 185 129 / 35%);
  `,
  coverPing: css`
    position: absolute;
    inset: 10px;

    border-radius: 12px;

    background: rgb(16 185 129 / 35%);

    animation: ${pulse} 1.5s ease-in-out infinite;
  `,
  coverIcon: css`
    position: absolute;
    z-index: 1;
    inset: 0;

    display: flex;
    align-items: center;
    justify-content: center;
  `,
  titleRow: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;

    margin-block-end: 4px;
  `,
  cta: css`
    border-radius: ${cssVar.borderRadius} !important;
    font-weight: 600;
    background: #059669 !important;

    &:hover {
      background: #10b981 !important;
      box-shadow: 0 0 20px rgb(16 185 129 / 40%);
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
        <Flexbox horizontal align={'center'} className={styles.left} gap={20}>
          <div
            className={styles.coverThumb}
            style={{ backgroundImage: `url(${FIELD_FIGHTER_COVER})` }}
          >
            <span className={styles.coverPing} />
            <span className={styles.coverIcon}>
              <Icon icon={Mic} size={28} style={{ color: '#d1fae5' }} />
            </span>
          </div>

          <Flexbox gap={4} style={{ minWidth: 0 }}>
            <div className={styles.titleRow}>
              <Text style={{ fontSize: 20, fontWeight: 700 }}>Полевой боец: «Дорого»</Text>
              <span className={styles.badge}>LIVE</span>
            </div>

            <Text color={cssVar.colorTextDescription} style={{ fontSize: 13, maxWidth: 460 }}>
              Голосовой тренажер по отработке возражения «Дорого / у конкурентов дешевле».
              Переговоры в реальном времени с ИИ-аватаром директора магазина.
            </Text>

            <Flexbox gap={16} style={{ marginTop: 6 }}>
              <Flexbox
                align={'center'}
                gap={4}
                style={{ color: 'var(--colorTextDescription)', fontSize: 12 }}
              >
                <Zap size={14} style={{ color: '#fbbf24' }} />
                ТП, возражения, переговоры
              </Flexbox>
            </Flexbox>
          </Flexbox>
        </Flexbox>

        <Button
          className={styles.cta}
          icon={<PhoneCall size={18} />}
          size={'large'}
          type={'primary'}
          onClick={handleStartCall}
        >
          Начать звонок
        </Button>
      </div>
    </Block>
  );
});

VoiceCallFieldFighterWidget.displayName = 'VoiceCallFieldFighterWidget';

export default VoiceCallFieldFighterWidget;
