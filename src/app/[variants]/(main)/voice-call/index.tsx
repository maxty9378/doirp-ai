'use client';

import { ChatHeader } from '@lobehub/ui/mobile';
import { Button } from 'antd';
import { createStaticStyles } from 'antd-style';
import dynamic from 'next/dynamic';
import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import WideScreenButton from '@/features/WideScreenContainer/WideScreenButton';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';
import { mobileHeaderSticky } from '@/styles/mobileHeader';

import VoiceCallOnboarding from '../agent/features/Conversation/AgentWelcome/VoiceCallOnboarding';
import TrainingScenarioEditor from '../training/features/TrainingScenarioEditor';
import { type VoiceCallEndPayload } from './features/GeminiLiveCall';
import PostCallReport from './features/GeminiLiveCall/PostCallReport';
import TrainingLegendScreen from './features/TrainingLegendScreen';

const GeminiLiveCall = dynamic(() => import('./features/GeminiLiveCall'), { ssr: false });

const styles = createStaticStyles(({ css, cssVar }) => ({
  root: css`
    position: relative;

    display: flex;
    flex-direction: column;

    width: 100%;
    height: 100%;
    min-height: 0;

    background: ${cssVar.colorBgLayout};
  `,
  body: css`
    position: relative;

    overflow: auto;
    flex: 1;

    min-height: 0;
    padding: 12px;

    @media (width <= 640px) {
      padding-block: 12px calc(env(safe-area-inset-bottom, 0px) + 16px);
      padding-inline: 12px;
    }
  `,
  headerActions: css`
    position: sticky;
    z-index: 8;
    inset-block-start: 0;

    display: flex;
    justify-content: flex-end;

    padding-block: 12px 8px;
    padding-inline: 12px;
  `,
  mobileHeader: css`
    flex-shrink: 0;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorBgContainer};
  `,
  editHeader: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    margin-block: 0 16px;
    margin-inline: 0;

    @media (width <= 640px) {
      flex-direction: column;
      align-items: stretch;
    }
  `,
  editHeaderActions: css`
    display: flex;
    gap: 12px;

    @media (width <= 640px) {
      flex-direction: column;
    }
  `,
  infoText: css`
    padding-block: 24px;
    padding-inline: 16px;
    color: ${cssVar.colorTextSecondary};
  `,
  reportScreen: css`
    position: absolute;
    z-index: 10;
    inset: 0;

    overflow: hidden;
    display: flex;
    flex-direction: column;

    width: 100%;
    height: 100%;

    background: ${cssVar.colorBgLayout};
  `,
  reportHeader: css`
    display: flex;
    flex-shrink: 0;
    gap: 16px;
    align-items: center;
    justify-content: space-between;

    padding-block: 16px;
    padding-inline: 24px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};

    @media (width <= 640px) {
      flex-direction: column;
      align-items: stretch;
      padding: 12px;
    }
  `,
  reportTitle: css`
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  reportActions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;

    @media (width <= 640px) {
      flex-direction: column;
      width: 100%;
    }
  `,
  reportScroll: css`
    overflow: auto;
    flex: 1;
    min-height: 0;
  `,
  reportContent: css`
    width: 100%;
    max-width: 1200px;
    margin-block: 0;
    margin-inline: auto;
    padding: 24px;

    @media (width <= 640px) {
      padding-block: 16px calc(env(safe-area-inset-bottom, 0px) + 24px);
      padding-inline: 12px;
    }
  `,
}));

interface VoiceCallConfigPayload {
  goals?: string[];
  legend?: string | null;
  showLegend?: boolean;
  title?: string | null;
}

export interface VoiceCallPageProps {
  layoutMode?: 'desktop' | 'mobile';
}

const LEGEND_CACHE_PREFIX = 'voice-call-config:';

const getCachedConfig = (agentId: string): VoiceCallConfigPayload | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`${LEGEND_CACHE_PREFIX}${agentId}`);
    if (!raw) return null;
    return JSON.parse(raw) as VoiceCallConfigPayload;
  } catch {
    return null;
  }
};

const setCachedConfig = (agentId: string, payload: VoiceCallConfigPayload) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${LEGEND_CACHE_PREFIX}${agentId}`, JSON.stringify(payload));
  } catch {
    // ignore cache failures
  }
};

export const VoiceCallPage = memo<VoiceCallPageProps>(({ layoutMode = 'desktop' }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isLogin = useUserStore(authSelectors.isLogin);
  const isLoaded = useUserStore(authSelectors.isLoaded);
  const agentId = searchParams.get('agentId') || 'training-gfd-stress';
  const isFieldFighter = agentId === 'training-tp-price-objection';
  const isAdmin = useIsAdmin();
  const mode = searchParams.get('mode') || 'call';
  const isEditMode = mode === 'edit';
  const isMobileLayout = layoutMode === 'mobile';

  const [legendState, setLegendState] = useState<{
    show: boolean;
    config: VoiceCallConfigPayload | null;
    loading: boolean;
  }>({ show: false, config: null, loading: true });

  const [reportView, setReportView] = useState<'call' | 'report'>('call');
  const [reportData, setReportData] = useState<VoiceCallEndPayload['analysisResult'] | null>(null);
  const [reportTranscript, setReportTranscript] = useState<VoiceCallEndPayload['transcript']>([]);
  const [reportSpeakerName, setReportSpeakerName] = useState<string>('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSessionId, setReportSessionId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isLogin) {
      navigate(isMobileLayout ? '/training' : '/');
    }
  }, [isLoaded, isLogin, isMobileLayout, navigate]);

  useEffect(() => {
    if (!isLoaded || !isLogin) return;
    setReportView('call');
    setReportData(null);
    setReportError(null);
    setReportSessionId(undefined);
  }, [agentId, isLoaded, isLogin]);

  useEffect(() => {
    if (!isLoaded || !isLogin) return;
    if (isFieldFighter || isEditMode) {
      setLegendState({ show: false, config: null, loading: false });
      return;
    }

    let cancelled = false;
    const cached = getCachedConfig(agentId);
    if (cached) {
      const show =
        cached.showLegend === true &&
        typeof cached.legend === 'string' &&
        cached.legend.trim().length > 0;
      setLegendState({ show, config: cached, loading: false });
    } else {
      setLegendState((s) => ({ ...s, loading: true }));
    }

    fetch(`/api/voice-call/config?agentId=${encodeURIComponent(agentId)}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: VoiceCallConfigPayload | null) => {
        if (cancelled || !payload) {
          if (!cancelled && !cached) setLegendState({ show: false, config: null, loading: false });
          return;
        }
        const show =
          payload.showLegend === true &&
          typeof payload.legend === 'string' &&
          payload.legend.trim().length > 0;
        setCachedConfig(agentId, payload);
        setLegendState({ show, config: payload, loading: false });
      })
      .catch(() => {
        if (!cancelled && !cached) setLegendState({ show: false, config: null, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, isEditMode, isFieldFighter, isLoaded, isLogin]);

  const backToTraining = useCallback(() => navigate('/training'), [navigate]);

  const handleCallEnd = useCallback(
    (payload: VoiceCallEndPayload) => {
      if (payload.transcript.length === 0 && !payload.error) {
        navigate(isMobileLayout ? '/training' : '/');
        return;
      }

      if (payload.error) {
        setReportError(payload.error);
        setReportData(null);
        setReportTranscript(payload.transcript || []);
        setReportSpeakerName(payload.speakerName || '');
        setReportSessionId(undefined);
      } else {
        setReportError(null);
        setReportData(payload.analysisResult ?? null);
        setReportTranscript(payload.transcript || []);
        setReportSpeakerName(payload.speakerName || '');
        setReportSessionId(payload.sessionId);
      }
      setReportView('report');
    },
    [isMobileLayout, navigate],
  );

  const skipToCall = () => setLegendState((s) => ({ ...s, show: false }));
  const openEditor = () => navigate(`/voice-call?agentId=${encodeURIComponent(agentId)}&mode=edit`);
  const openCall = () => navigate(`/voice-call?agentId=${encodeURIComponent(agentId)}`);
  const resetToCall = () => {
    setReportView('call');
    setReportData(null);
    setReportError(null);
    setReportSessionId(undefined);
  };

  if (!isLogin) return null;

  const mobileTitle = isEditMode
    ? 'Редактор сценария'
    : reportView === 'report'
      ? 'Результат сессии'
      : legendState.config?.title?.trim() || 'Тренажёр';

  return (
    <div className={styles.root}>
      {isMobileLayout ? (
        <div className={styles.mobileHeader}>
          <ChatHeader
            showBackButton
            center={
              <ChatHeader.Title title={<span style={{ lineHeight: 1.2 }}>{mobileTitle}</span>} />
            }
            style={mobileHeaderSticky}
            onBackClick={() => {
              if (isEditMode) {
                openCall();
                return;
              }
              backToTraining();
            }}
          />
        </div>
      ) : (
        <div className={styles.headerActions}>
          <WideScreenButton />
        </div>
      )}

      <div className={styles.body}>
        {isEditMode ? (
          isAdmin ? (
            <>
              <div className={styles.editHeader}>
                <Button block={isMobileLayout} type="default" onClick={openCall}>
                  К тренажёру
                </Button>
              </div>
              <TrainingScenarioEditor hideSelector initialKey={agentId} mobile={isMobileLayout} />
            </>
          ) : (
            <div className={styles.infoText}>Нет доступа к настройкам сценария.</div>
          )
        ) : isFieldFighter ? (
          <VoiceCallOnboarding />
        ) : legendState.loading ? (
          <div className={styles.infoText}>Загрузка...</div>
        ) : legendState.show && legendState.config?.legend ? (
          <TrainingLegendScreen
            goals={legendState.config.goals ?? []}
            legend={legendState.config.legend}
            mobile={isMobileLayout}
            title={legendState.config.title ?? undefined}
            onEdit={isAdmin ? openEditor : undefined}
            onStart={skipToCall}
          />
        ) : reportView === 'report' ? (
          <div className={styles.reportScreen}>
            <header className={styles.reportHeader}>
              {!isMobileLayout && <h1 className={styles.reportTitle}>Результат сессии</h1>}
              <div className={styles.reportActions}>
                <Button block={isMobileLayout} type="primary" onClick={() => navigate('/')}>
                  На главную
                </Button>
                <Button block={isMobileLayout} onClick={() => navigate('/voice-call/sessions')}>
                  Мои сессии
                </Button>
                <Button block={isMobileLayout} onClick={resetToCall}>
                  Новый звонок
                </Button>
              </div>
            </header>
            <div className={styles.reportScroll}>
              <div className={styles.reportContent}>
                {reportError && (
                  <div
                    style={{
                      padding: 16,
                      marginBottom: 16,
                      color: 'var(--colorError)',
                      background: 'rgba(255, 77, 79, 0.1)',
                      border: '1px solid rgba(255, 77, 79, 0.2)',
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>Анализ недоступен</div>
                    {reportError}
                  </div>
                )}
                {reportData && (
                  <PostCallReport
                    data={reportData}
                    speakerName={reportSpeakerName}
                    transcript={reportTranscript}
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {isAdmin && (
              <div className={styles.editHeader}>
                <div style={{ fontWeight: 600 }}>Тренажёр</div>
                <div className={styles.editHeaderActions}>
                  <Button block={isMobileLayout} onClick={openEditor}>
                    Редактировать
                  </Button>
                  {isMobileLayout && (
                    <Button block onClick={() => navigate('/voice-call/sessions')}>
                      Мои сессии
                    </Button>
                  )}
                </div>
              </div>
            )}
            <GeminiLiveCall
              agentId={agentId}
              layoutMode={layoutMode}
              onEnd={handleCallEnd}
              onExit={() => (isMobileLayout ? backToTraining() : navigate(-1))}
            />
          </>
        )}
      </div>
    </div>
  );
});

VoiceCallPage.displayName = 'VoiceCallPage';

export default VoiceCallPage;
