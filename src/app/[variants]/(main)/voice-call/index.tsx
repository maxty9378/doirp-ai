'use client';

import { Button } from 'antd';
import { createStaticStyles } from 'antd-style';
import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import WideScreenButton from '@/features/WideScreenContainer/WideScreenButton';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

import VoiceCallOnboarding from '../agent/features/Conversation/AgentWelcome/VoiceCallOnboarding';
import TrainingScenarioEditor from '../training/features/TrainingScenarioEditor';
import GeminiLiveCall, { type VoiceCallEndPayload } from './features/GeminiLiveCall';
import PostCallReport from './features/GeminiLiveCall/PostCallReport';
import TrainingLegendScreen from './features/TrainingLegendScreen';

const styles = createStaticStyles(({ css, cssVar }) => ({
  root: css`
    position: relative;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;

    width: 100%;
    height: 100%;
    padding: 12px;

    background: ${cssVar.colorBgLayout};
  `,
  headerActions: css`
    position: sticky;
    z-index: 8;
    inset-block-start: 0;

    display: flex;
    justify-content: flex-end;

    padding-block-end: 8px;
  `,
  editHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 8px 0 16px 0;
  `,
  reportScreen: css`
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: ${cssVar.colorBgLayout};
    overflow: hidden;
  `,
  reportHeader: css`
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    padding: 16px 24px;
    border-bottom: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorBgContainer};
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
  `,
  reportScroll: css`
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  `,
  reportContent: css`
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
  `,
}));

interface VoiceCallConfigPayload {
  goals?: string[];
  legend?: string | null;
  showLegend?: boolean;
  title?: string | null;
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

const VoiceCallPage = memo(() => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isLogin = useUserStore(authSelectors.isLogin);
  const isLoaded = useUserStore(authSelectors.isLoaded);
  const agentId = searchParams.get('agentId') || 'training-gfd-stress';
  const isFieldFighter = agentId === 'training-tp-price-objection';
  const isAdmin = useIsAdmin();
  const mode = searchParams.get('mode') || 'call';
  const isEditMode = mode === 'edit';

  const [legendState, setLegendState] = useState<{
    show: boolean;
    config: VoiceCallConfigPayload | null;
    loading: boolean;
  }>({ show: false, config: null, loading: true });

  const [reportView, setReportView] = useState<'call' | 'report'>('call');
  const [reportData, setReportData] = useState<VoiceCallEndPayload['analysisResult'] | null>(null);
  const [reportTranscript, setReportTranscript] = useState<any[]>([]);
  const [reportSpeakerName, setReportSpeakerName] = useState<string>('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSessionId, setReportSessionId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isLogin) {
      navigate('/');
    }
  }, [isLoaded, isLogin, navigate]);

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
    fetch(`/api/voice-call/config?agentId=${encodeURIComponent(agentId)}`, { credentials: 'include' })
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
  }, [agentId, isFieldFighter, isLoaded, isLogin]);

  const handleCallEnd = useCallback(
    (payload: VoiceCallEndPayload) => {
      // Если вообще нет транскрипта и нет ошибки — просто выходим
      if (payload.transcript.length === 0 && !payload.error) {
        navigate('/');
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
    [navigate],
  );

  const skipToCall = () => setLegendState((s) => ({ ...s, show: false }));
  const openEditor = () =>
    navigate(`/voice-call?agentId=${encodeURIComponent(agentId)}&mode=edit`);
  const openCall = () => navigate(`/voice-call?agentId=${encodeURIComponent(agentId)}`);

  if (!isLogin) return null;

  return (
    <div className={styles.root}>
      <div className={styles.headerActions} style={{ paddingBottom: isEditMode ? 0 : 8 }}>
        <WideScreenButton />
      </div>
      {isEditMode ? (
        isAdmin ? (
          <>
            <div className={styles.editHeader} style={{ marginBottom: 0, marginTop: 0 }}>
              <Button type="default" onClick={openCall}>
                ← К тренажёру
              </Button>
            </div>
            <TrainingScenarioEditor hideSelector initialKey={agentId} />
          </>
        ) : (
          <div style={{ padding: 24, color: 'var(--colorTextSecondary)' }}>
            Нет доступа к настройкам сценария.
          </div>
        )
      ) : isFieldFighter ? (
        <VoiceCallOnboarding />
      ) : legendState.loading ? (
        <div style={{ padding: 24, color: 'var(--colorTextSecondary)' }}>Загрузка...</div>
      ) : legendState.show && legendState.config?.legend ? (
        <TrainingLegendScreen
          goals={legendState.config.goals ?? []}
          legend={legendState.config.legend}
          title={legendState.config.title ?? undefined}
          onEdit={isAdmin ? openEditor : undefined}
          onStart={skipToCall}
        />
      ) : reportView === 'report' ? (
        <div className={styles.reportScreen}>
          <header className={styles.reportHeader}>
            <h1 className={styles.reportTitle}>Результат сессии</h1>
            <div className={styles.reportActions}>
              <Button type="primary" onClick={() => navigate('/')}>
                На главную
              </Button>
              <Button onClick={() => navigate('/voice-call/sessions')}>Мои сессии</Button>
              <Button
                onClick={() => {
                  setReportView('call');
                  setReportData(null);
                  setReportError(null);
                  setReportSessionId(undefined);
                }}
              >
                Новый звонок
              </Button>
            </div>
          </header>
          <div className={styles.reportScroll}>
            <div className={styles.reportContent}>
              {reportError && (
                <div style={{ color: 'var(--colorError)', marginBottom: 16, padding: '16px', background: 'rgba(255, 77, 79, 0.1)', borderRadius: '8px', border: '1px solid rgba(255, 77, 79, 0.2)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Анализ недоступен</div>
                  {reportError}
                </div>
              )}
              {reportData && <PostCallReport data={reportData} speakerName={reportSpeakerName} transcript={reportTranscript} />}
            </div>
          </div>
        </div>
      ) : (
        <>
          {isAdmin && (
            <div className={styles.editHeader}>
              <div style={{ fontWeight: 600 }}>Тренажёр</div>
              <Button onClick={openEditor}>Редактировать</Button>
            </div>
          )}
          <GeminiLiveCall
            agentId={agentId}
            onEnd={handleCallEnd}
            onExit={() => navigate(-1)}
          />
        </>
      )}
    </div>
  );
});

VoiceCallPage.displayName = 'VoiceCallPage';

export default VoiceCallPage;
