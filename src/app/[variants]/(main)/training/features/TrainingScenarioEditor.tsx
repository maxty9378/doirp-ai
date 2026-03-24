'use client';

import { Flexbox, Form, type FormGroupItemType, Icon } from '@lobehub/ui';
import { Button, Input, InputNumber, Modal as AntModal, Select, Switch, Table, Tag, message } from 'antd';
import { createStyles } from 'antd-style';
import {
  BookOpen,
  Brain,
  CheckCircle,
  Loader2,
  MessageSquare,
  Mic,
  Pencil,
  Plus,
  Save,
  Settings,
  Target,
  Timer,
  Trash2,
  Upload,
  UserCircle,
  XCircle,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FORM_STYLE } from '@/const/layoutTokens';
import { uploadService } from '@/services/upload';

const useStyles = createStyles(({ css }) => ({
  section: css`
    margin-bottom: 24px;
  `,
  sectionTitle: css`
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
  `,
  wrap: css`
    padding-top: 12px;
  `,
  statusBadge: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  `,
  headerRow: css`
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  `,
}));

const toTrainingBannerUrl = (path: string) => {
  const normalizedPath = path.replace(/^\/+/, '').trim();
  const keyPrefix = 'voice-call/trainer-banner/';
  if (normalizedPath.startsWith(keyPrefix)) {
    const keyTail = normalizedPath.slice(keyPrefix.length);
    return `/webapi/voice-call/trainer-banner/${keyTail}`;
  }
  return `/webapi/${normalizedPath}`;
};

interface KnowledgeEntry {
  id: string;
  productIngredient: string;
  officialUsp: string;
  attackMyth: string;
}

interface ScoreLevelLabels {
  high?: string;
  low?: string;
  mid?: string;
}

interface ScenarioPayload {
  id: string;
  key: string;
  title: string | null;
  description: string | null;
  legend: string | null;
  userRole: string | null;
  goals: string[];
  checkpointIds: string[];
  systemPrompt: string | null;
  analyzePrompt: string | null;
  debriefPrompt: string | null;
  assistantLabel: string | null;
  userLabel: string | null;
  voiceName: string | null;
  bannerUrl: string | null;
  contextWindow: number | null;
  sessionDurationMs: number | null;
  silenceNudgeAfterMs: number | null;
  silenceNudgeCooldownMs: number | null;
  silenceHardHangupMs: number | null;
  silenceNudgePhrases: string[];
  showLegend: boolean | null;
  enableCheckpoints: boolean | null;
  enableScoring: boolean | null;
  isActive: boolean | null;
  scoreDisplayLabel: string | null;
  scoreLevelLabels: ScoreLevelLabels | null;
  openingInstruction: string | null;
  showIntroDialog: boolean | null;
  introDialogTitle: string | null;
  introDialogDescription: string | null;
  introDialogPlaceholder: string | null;
  introDialogHint: string | null;
  introDialogButtonLabel: string | null;
  roundEndingPrompt: string | null;
  silenceNudgeTemplate: string | null;
  shortAnswerNudge: string | null;
  quietSpeakerNudge: string | null;
  autoSuccessPrompt: string | null;
}

interface TrainingAdminPayload {
  knowledgeEntries: KnowledgeEntry[];
  scenario: ScenarioPayload;
}

export interface TrainingScenarioEditorProps {
  initialKey?: string | null;
  hideSelector?: boolean;
}

const groupIcon = (IconComp: typeof Settings, color?: string) => (
  <Icon icon={IconComp} size={18} style={{ color: color || 'var(--colorPrimary)' }} />
);

const TrainingScenarioEditor = memo(({ initialKey, hideSelector }: TrainingScenarioEditorProps) => {
  const { styles } = useStyles();
  const [form] = Form.useForm();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [payload, setPayload] = useState<TrainingAdminPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);
  const [scenarioOptions, setScenarioOptions] = useState<Array<{ label: string; value: string }>>([]);

  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
  const [knowledgeModalMode, setKnowledgeModalMode] = useState<'add' | 'edit'>('add');
  const [knowledgeEditId, setKnowledgeEditId] = useState<string | null>(null);
  const [knowledgeForm] = Form.useForm();

  useEffect(() => {
    fetch('/api/training/scenarios?includeInactive=true', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { scenarios: [] }))
      .then((data: { scenarios?: Array<{ key: string; title: string; isActive?: boolean }> }) => {
        setScenarioOptions(
          (data.scenarios ?? []).map((s) => ({
            label: s.isActive === false ? `${s.title} (неактивен)` : s.title,
            value: s.key,
          })),
        );
      })
      .catch(() => {});
  }, []);

  const handleBannerFileSelected = useCallback(
    async (file?: File | null) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        message.error('Нужно выбрать файл изображения');
        return;
      }
      if (!payload?.scenario?.key) {
        message.error('Сценарий ещё не загружен');
        return;
      }
      setBannerUploading(true);
      try {
        const { data } = await uploadService.uploadFileToS3(file, {
          directory: 'voice-call/trainer-banner',
        });
        const uploadedUrl = toTrainingBannerUrl(data.path);
        form.setFieldsValue({ bannerUrl: uploadedUrl });
        message.success('Баннер загружен, не забудьте сохранить сценарий');
      } catch (error) {
        const text =
          error instanceof Error ? error.message : 'Не удалось загрузить баннер, попробуйте позже';
        message.error(text);
      } finally {
        setBannerUploading(false);
        if (bannerFileInputRef.current) bannerFileInputRef.current.value = '';
      }
    },
    [form, message, payload],
  );

  const loadScenario = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/training/scenario?key=${encodeURIComponent(key)}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data: TrainingAdminPayload = await res.json();
      setPayload(data);
      form.setFieldsValue({
        title: data.scenario.title ?? '',
        description: data.scenario.description ?? '',
        legend: data.scenario.legend ?? '',
        userRole: data.scenario.userRole ?? '',
        goals: (data.scenario.goals ?? []).join('\n'),
        checkpointIds: (data.scenario.checkpointIds ?? []).join('\n'),
        systemPrompt: data.scenario.systemPrompt ?? '',
        analyzePrompt: data.scenario.analyzePrompt ?? '',
        debriefPrompt: data.scenario.debriefPrompt ?? '',
        assistantLabel: data.scenario.assistantLabel ?? '',
        userLabel: data.scenario.userLabel ?? '',
        voiceName: data.scenario.voiceName ?? '',
        bannerUrl: data.scenario.bannerUrl ?? '',
        contextWindow: data.scenario.contextWindow ?? 5,
        sessionDurationSec: Math.round(
          (data.scenario.sessionDurationMs ?? data.scenario.silenceHardHangupMs ?? 300_000) / 1000,
        ),
        silenceNudgeAfterMs: data.scenario.silenceNudgeAfterMs ?? 5000,
        silenceNudgeCooldownMs: data.scenario.silenceNudgeCooldownMs ?? 15000,
        silenceHardHangupMs: Math.round(
          (data.scenario.silenceHardHangupMs ?? 300_000) / 1000,
        ),
        silenceNudgePhrases: (data.scenario.silenceNudgePhrases ?? []).join('\n'),
        showLegend: data.scenario.showLegend ?? true,
        enableCheckpoints: data.scenario.enableCheckpoints ?? false,
        enableScoring: data.scenario.enableScoring ?? false,
        isActive: data.scenario.isActive ?? true,
        scoreDisplayLabel: data.scenario.scoreDisplayLabel ?? '',
        scoreLevelLow: data.scenario.scoreLevelLabels?.low ?? '',
        scoreLevelMid: data.scenario.scoreLevelLabels?.mid ?? '',
        scoreLevelHigh: data.scenario.scoreLevelLabels?.high ?? '',
        openingInstruction: data.scenario.openingInstruction ?? '',
        showIntroDialog: data.scenario.showIntroDialog ?? true,
        introDialogTitle: data.scenario.introDialogTitle ?? '',
        introDialogDescription: data.scenario.introDialogDescription ?? '',
        introDialogPlaceholder: data.scenario.introDialogPlaceholder ?? '',
        introDialogHint: data.scenario.introDialogHint ?? '',
        introDialogButtonLabel: data.scenario.introDialogButtonLabel ?? '',
        roundEndingPrompt: data.scenario.roundEndingPrompt ?? '',
        silenceNudgeTemplate: data.scenario.silenceNudgeTemplate ?? '',
        shortAnswerNudge: data.scenario.shortAnswerNudge ?? '',
        quietSpeakerNudge: data.scenario.quietSpeakerNudge ?? '',
        autoSuccessPrompt: data.scenario.autoSuccessPrompt ?? '',
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Не удалось загрузить тренажёр');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [form, message]);

  useEffect(() => {
    if (selectedKey) void loadScenario(selectedKey);
    else setPayload(null);
  }, [selectedKey, loadScenario]);

  useEffect(() => {
    if (initialKey && initialKey !== selectedKey) {
      setSelectedKey(initialKey);
    }
  }, [initialKey, selectedKey]);

  const handleSaveScenario = useCallback(async () => {
    if (!payload?.scenario?.key) return;
    const values = await form.validateFields().catch(() => null);
    if (values == null) return;
    const goals = String(values.goals ?? '')
      .split('\n')
      .map((s: string) => s.trim())
      .filter(Boolean);
    const checkpointIds = String(values.checkpointIds ?? '')
      .split('\n')
      .map((s: string) => s.trim())
      .filter(Boolean);
    const silenceNudgePhrases = String(values.silenceNudgePhrases ?? '')
      .split('\n')
      .map((s: string) => s.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/training/scenario', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          key: payload.scenario.key,
          title: values.title || null,
          description: values.description || null,
          legend: values.legend || null,
          userRole: values.userRole || null,
          goals,
          checkpointIds,
          systemPrompt: values.systemPrompt || null,
          analyzePrompt: values.analyzePrompt || null,
          debriefPrompt: values.debriefPrompt || null,
          assistantLabel: values.assistantLabel || null,
          userLabel: values.userLabel || null,
          voiceName: values.voiceName || null,
          bannerUrl: values.bannerUrl || null,
          contextWindow: values.contextWindow ?? null,
          sessionDurationMs:
            typeof values.sessionDurationSec === 'number'
              ? values.sessionDurationSec * 1000
              : null,
          silenceNudgeAfterMs: values.silenceNudgeAfterMs ?? null,
          silenceNudgeCooldownMs: values.silenceNudgeCooldownMs ?? null,
          silenceHardHangupMs:
            typeof values.silenceHardHangupMs === 'number'
              ? values.silenceHardHangupMs * 1000
              : null,
          silenceNudgePhrases,
          showLegend: values.showLegend ?? null,
          enableCheckpoints: values.enableCheckpoints ?? null,
          enableScoring: values.enableScoring ?? null,
          isActive: values.isActive ?? null,
          scoreDisplayLabel: values.scoreDisplayLabel || null,
          scoreLevelLabels:
            values.scoreLevelLow || values.scoreLevelMid || values.scoreLevelHigh
              ? {
                  high: values.scoreLevelHigh || undefined,
                  low: values.scoreLevelLow || undefined,
                  mid: values.scoreLevelMid || undefined,
                }
              : null,
          openingInstruction: values.openingInstruction || null,
          showIntroDialog: values.showIntroDialog ?? null,
          introDialogTitle: values.introDialogTitle || null,
          introDialogDescription: values.introDialogDescription || null,
          introDialogPlaceholder: values.introDialogPlaceholder || null,
          introDialogHint: values.introDialogHint || null,
          introDialogButtonLabel: values.introDialogButtonLabel || null,
          roundEndingPrompt: values.roundEndingPrompt || null,
          silenceNudgeTemplate: values.silenceNudgeTemplate || null,
          shortAnswerNudge: values.shortAnswerNudge || null,
          quietSpeakerNudge: values.quietSpeakerNudge || null,
          autoSuccessPrompt: values.autoSuccessPrompt || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      message.success('Сценарий сохранён');
      void loadScenario(payload.scenario.key);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }, [form, message, payload, loadScenario]);

  const openKnowledgeModal = useCallback((mode: 'add' | 'edit', entry?: KnowledgeEntry) => {
    setKnowledgeModalMode(mode);
    setKnowledgeEditId(entry?.id ?? null);
    knowledgeForm.setFieldsValue({
      productIngredient: entry?.productIngredient ?? '',
      officialUsp: entry?.officialUsp ?? '',
      attackMyth: entry?.attackMyth ?? '',
    });
    setKnowledgeModalOpen(true);
  }, [knowledgeForm]);

  const handleKnowledgeModalOk = useCallback(async () => {
    if (!payload?.scenario) return;
    const values = await knowledgeForm.validateFields().catch(() => null);
    if (!values) return;
    setKnowledgeLoading(true);
    try {
      if (knowledgeModalMode === 'add') {
        const res = await fetch('/api/admin/training/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            scenarioId: payload.scenario.id,
            productIngredient: values.productIngredient.trim(),
            officialUsp: values.officialUsp.trim(),
            attackMyth: values.attackMyth.trim(),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || res.statusText);
        }
        message.success('Запись добавлена');
      } else {
        const res = await fetch('/api/admin/training/knowledge', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            id: knowledgeEditId,
            productIngredient: values.productIngredient.trim(),
            officialUsp: values.officialUsp.trim(),
            attackMyth: values.attackMyth.trim(),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || res.statusText);
        }
        message.success('Запись обновлена');
      }
      setKnowledgeModalOpen(false);
      void loadScenario(payload.scenario.key);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setKnowledgeLoading(false);
    }
  }, [knowledgeForm, knowledgeModalMode, knowledgeEditId, payload, message, loadScenario]);

  const handleDeleteKnowledge = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/admin/training/knowledge?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || res.statusText);
        }
        message.success('Запись удалена');
        if (payload?.scenario?.key) void loadScenario(payload.scenario.key);
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Не удалось удалить');
      }
    },
    [message, payload, loadScenario],
  );

  const basicGroup: FormGroupItemType = useMemo(
    () => ({
      icon: groupIcon(Settings),
      title: 'Основные настройки',
      children: [
        {
          label: 'Название',
          desc: 'Название тренажёра, видимое пользователям',
          children: <Input placeholder="Название тренажёра" />,
          name: 'title',
          minWidth: undefined,
        },
        {
          label: 'Описание',
          desc: 'Краткое описание сценария',
          children: (
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Краткое описание" />
          ),
          name: 'description',
        },
        {
          label: 'Голос ИИ',
          desc: 'Голос для синтеза речи ИИ-агента',
          children: (
            <Select
              placeholder="Выберите голос"
              options={[
                { label: 'Puck', value: 'Puck' },
                { label: 'Charon', value: 'Charon' },
                { label: 'Kore', value: 'Kore' },
                { label: 'Fenrir', value: 'Fenrir' },
                { label: 'Aoede', value: 'Aoede' },
              ]}
              allowClear
            />
          ),
          name: 'voiceName',
          minWidth: undefined,
        },
        {
          label: 'Баннер',
          desc: 'Загрузите картинку баннера',
          children: (
            <Flexbox gap={8} horizontal align="center">
              <Input placeholder="https://..." style={{ flex: 1 }} />
              <Button
                icon={<Upload size={14} />}
                loading={bannerUploading}
                onClick={() => bannerFileInputRef.current?.click()}
              >
                Загрузить
              </Button>
            </Flexbox>
          ),
          name: 'bannerUrl',
          minWidth: undefined,
        },
        {
          label: 'Активен',
          desc: 'Виден ли тренажёр пользователям',
          children: <Switch />,
          name: 'isActive',
          valuePropName: 'checked',
          minWidth: undefined,
        },
      ],
    }),
    [bannerUploading],
  );

  const roleGroup: FormGroupItemType = useMemo(() => ({
    icon: groupIcon(UserCircle, '#f59e0b'),
    title: 'Роль и легенда',
    children: [
      {
        label: 'Легенда',
        desc: 'Контекст, который видит пользователь перед стартом',
        children: <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="Текст легенды" />,
        name: 'legend',
      },
      {
        label: 'Роль пользователя',
        desc: 'Кем является пользователь в сценарии',
        children: <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Кто вы в сценарии" />,
        name: 'userRole',
      },
      {
        label: 'Показывать легенду',
        children: <Switch />,
        name: 'showLegend',
        valuePropName: 'checked',
        minWidth: undefined,
      },
    ],
  }), []);

  const aiGroup: FormGroupItemType = useMemo(() => ({
    icon: groupIcon(Brain, '#8b5cf6'),
    title: 'ИИ-агент',
    children: [
      {
        label: 'Системный промпт',
        desc: 'Главные инструкции для ИИ-агента (роль, поведение, правила)',
        children: <Input.TextArea autoSize={{ minRows: 8, maxRows: 20 }} placeholder="Инструкции для ИИ-агента" />,
        name: 'systemPrompt',
      },
      {
        label: 'Метка ассистента',
        desc: 'Имя ИИ в интерфейсе (напр. «Журналистка-расследователь»)',
        children: <Input placeholder="Журналистка-расследователь" />,
        name: 'assistantLabel',
        minWidth: undefined,
      },
      {
        label: 'Метка пользователя',
        desc: 'Имя пользователя в интерфейсе (напр. «Вы (Маркетолог GFD)»)',
        children: <Input placeholder="Вы (Маркетолог GFD)" />,
        name: 'userLabel',
        minWidth: undefined,
      },
      {
        label: 'Окно контекста (реплик)',
        desc: 'Сколько последних реплик хранить в контексте',
        children: <InputNumber min={1} max={20} style={{ width: 120 }} />,
        name: 'contextWindow',
        minWidth: undefined,
      },
    ],
  }), []);

  const timeGroup: FormGroupItemType = useMemo(() => ({
    icon: groupIcon(Timer, '#06b6d4'),
    title: 'Время и тишина',
    children: [
      {
        label: 'Длительность сессии (сек)',
        desc: 'Максимальное время одной тренировочной сессии. Таймер обратного отсчёта показывается пользователю.',
        children: <InputNumber min={30} step={30} style={{ width: 140 }} addonAfter="сек" />,
        name: 'sessionDurationSec',
        minWidth: undefined,
      },
      {
        label: 'Таймаут тишины (сек)',
        desc: 'Через сколько секунд полной тишины звонок завершится автоматически',
        children: <InputNumber min={30} step={30} style={{ width: 140 }} addonAfter="сек" />,
        name: 'silenceHardHangupMs',
        minWidth: undefined,
      },
      {
        label: 'Подсказка при паузе через (мс)',
        desc: 'Через сколько мс после тишины прозвучит первая подсказка',
        children: <InputNumber min={1000} step={1000} style={{ width: 140 }} />,
        name: 'silenceNudgeAfterMs',
        minWidth: undefined,
      },
      {
        label: 'Кулдаун подсказки (мс)',
        desc: 'Минимальная задержка между подсказками при тишине',
        children: <InputNumber min={1000} step={1000} style={{ width: 140 }} />,
        name: 'silenceNudgeCooldownMs',
        minWidth: undefined,
      },
      {
        label: 'Фразы при тишине',
        desc: 'Каждая с новой строки',
        children: (
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder="Что, аргументы закончились?\nЗрители ждут ответа."
          />
        ),
        name: 'silenceNudgePhrases',
      },
    ],
  }), []);

  const scoringGroup: FormGroupItemType = useMemo(() => ({
    icon: groupIcon(Target, '#ef4444'),
    title: 'Оценка и чекпоинты',
    children: [
      {
        label: 'Чекпоинты',
        desc: 'Отслеживать выполнение целей',
        children: <Switch />,
        name: 'enableCheckpoints',
        valuePropName: 'checked',
        minWidth: undefined,
      },
      {
        label: 'Скоринг',
        desc: 'Включить подсчёт очков в реальном времени',
        children: <Switch />,
        name: 'enableScoring',
        valuePropName: 'checked',
        minWidth: undefined,
      },
      {
        label: 'Цели разговора',
        desc: 'Каждая цель с новой строки. Отображаются пользователю.',
        children: <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="Цель 1\nЦель 2" />,
        name: 'goals',
      },
      {
        label: 'ID чекпоинтов',
        desc: 'Каждый ID с новой строки. Порядок соответствует целям. LLM использует эти ID в тегах [CHECKPOINT: ID].',
        children: <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="STRESS_CONTROL\nFACT_CHECK" />,
        name: 'checkpointIds',
      },
      {
        label: 'Подпись индикатора',
        desc: 'Текст над шкалой оценки (напр. «Эфирный прессинг»)',
        children: <Input placeholder="Эфирный прессинг" />,
        name: 'scoreDisplayLabel',
        minWidth: undefined,
      },
      {
        label: 'Подпись: низкий счёт (< -10)',
        children: <Input placeholder="Провал интервью" />,
        name: 'scoreLevelLow',
        minWidth: undefined,
      },
      {
        label: 'Подпись: средний счёт (-10..10)',
        children: <Input placeholder="Напряженная пауза" />,
        name: 'scoreLevelMid',
        minWidth: undefined,
      },
      {
        label: 'Подпись: высокий счёт (> 10)',
        children: <Input placeholder="Уверенная позиция" />,
        name: 'scoreLevelHigh',
        minWidth: undefined,
      },
    ],
  }), []);

  const introDialogGroup: FormGroupItemType = useMemo(() => ({
    icon: groupIcon(Mic, '#10b981'),
    title: 'Диалог представления',
    children: [
      {
        label: 'Показывать диалог',
        desc: 'Запрашивать имя/позывной перед стартом',
        children: <Switch />,
        name: 'showIntroDialog',
        valuePropName: 'checked',
        minWidth: undefined,
      },
      {
        label: 'Заголовок',
        children: <Input placeholder="Идентификация агента" />,
        name: 'introDialogTitle',
        minWidth: undefined,
      },
      {
        label: 'Описание',
        children: (
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Введите позывной или реальное имя..." />
        ),
        name: 'introDialogDescription',
      },
      {
        label: 'Плейсхолдер',
        children: <Input placeholder="Иван Петров или «Маркетолог GFD»" />,
        name: 'introDialogPlaceholder',
        minWidth: undefined,
      },
      {
        label: 'Подсказка',
        children: (
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 3 }} placeholder="Можно указать реальное имя..." />
        ),
        name: 'introDialogHint',
      },
      {
        label: 'Текст кнопки',
        children: <Input placeholder="Начать интервью" />,
        name: 'introDialogButtonLabel',
        minWidth: undefined,
      },
    ],
  }), []);

  const inCallPromptsGroup: FormGroupItemType = useMemo(() => ({
    icon: groupIcon(MessageSquare, '#f97316'),
    title: 'Промпты во время звонка',
    children: [
      {
        label: 'Инструкция на старт',
        desc: 'Плейсхолдеры: {{assistantLabel}}, {{nameLine}}',
        children: (
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 8 }}
            placeholder="Начинай интервью. Представься коротко как {{assistantLabel}}..."
          />
        ),
        name: 'openingInstruction',
      },
      {
        label: 'Предупреждение перед концом',
        children: (
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Через 15 секунд наш эфир подходит к концу..." />
        ),
        name: 'roundEndingPrompt',
      },
      {
        label: 'Шаблон подсказки при тишине',
        desc: 'Плейсхолдер {{phrase}} — фраза из списка',
        children: (
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder='Собеседник молчит. Скажи: "{{phrase}}".' />
        ),
        name: 'silenceNudgeTemplate',
      },
      {
        label: '«Отвечай короче»',
        children: (
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} placeholder="Отвечай короче: 1-2 предложения..." />
        ),
        name: 'shortAnswerNudge',
      },
      {
        label: '«Собеседник говорит тихо»',
        children: (
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} placeholder="Собеседник говорит очень тихо..." />
        ),
        name: 'quietSpeakerNudge',
      },
      {
        label: 'Промпт при авто-успехе',
        children: (
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Маркетолог справился. Признай поражение..." />
        ),
        name: 'autoSuccessPrompt',
      },
    ],
  }), []);

  const promptsAfterCallGroup: FormGroupItemType = useMemo(() => ({
    icon: groupIcon(BookOpen, '#6366f1'),
    title: 'Промпты после звонка',
    children: [
      {
        label: 'Промпт анализа',
        desc: 'Инструкция для LLM при разборе транскрипта. Подставка: {{transcript}}',
        children: <Input.TextArea autoSize={{ minRows: 6, maxRows: 16 }} placeholder="Оставьте пустым для стандартного" />,
        name: 'analyzePrompt',
      },
      {
        label: 'Промпт дебрифа',
        desc: 'Краткий разбор (2 ошибки, 1 сильная сторона). Подставка: {{transcript}}',
        children: <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} placeholder="Оставьте пустым для стандартного" />,
        name: 'debriefPrompt',
      },
    ],
  }), []);

  const isActive = payload?.scenario?.isActive ?? true;

  return (
    <div className={styles.wrap}>
      <input
        accept="image/*"
        ref={bannerFileInputRef}
        style={{ display: 'none' }}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void handleBannerFileSelected(file);
        }}
      />

      <div className={styles.section} style={{ marginBottom: 12, maxWidth: FORM_STYLE.style?.maxWidth }}>
        <Flexbox align="center" gap={16} horizontal justify="space-between">
          <div className={styles.headerRow}>
            <div className={styles.sectionTitle} style={{ marginBottom: 0, fontSize: 24 }}>
              Настройки сценария
            </div>
            {payload && (
              <Tag
                color={isActive ? 'success' : 'default'}
                icon={isActive ? <CheckCircle size={12} /> : <XCircle size={12} />}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                {isActive ? 'Активен' : 'Неактивен'}
              </Tag>
            )}
          </div>
          {!hideSelector && (
            <Select
              allowClear
              options={scenarioOptions}
              placeholder="Выберите тренажёр"
              style={{ width: 320 }}
              value={selectedKey}
              onChange={(v) => setSelectedKey(v ?? null)}
            />
          )}
        </Flexbox>
      </div>

      {loading && (
        <div style={{ color: 'var(--colorTextSecondary)', marginTop: 12 }}>
          <Loader2 size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Загрузка...
        </div>
      )}

      {payload && !loading && (
        <Flexbox gap={24} style={{ marginTop: 0 }}>
          <Form
            form={form}
            items={[
              basicGroup,
              roleGroup,
              aiGroup,
              timeGroup,
              scoringGroup,
              introDialogGroup,
              inCallPromptsGroup,
              promptsAfterCallGroup,
            ]}
            itemsType="group"
            variant="filled"
            {...FORM_STYLE}
          />
          <Flexbox align="flex-end" style={{ marginTop: 0, maxWidth: FORM_STYLE.style?.maxWidth }}>
            <Button
              icon={<Save size={16} />}
              loading={saving}
              type="primary"
              size="large"
              onClick={() => void handleSaveScenario()}
            >
              Сохранить сценарий
            </Button>
          </Flexbox>

          <div className={styles.section} style={{ marginTop: 24, maxWidth: FORM_STYLE.style?.maxWidth }}>
            <Flexbox align="center" gap={16} horizontal justify="space-between" style={{ marginBottom: 16 }}>
              <Flexbox align="center" gap={8} horizontal>
                {groupIcon(BookOpen, '#f59e0b')}
                <div className={styles.sectionTitle} style={{ marginBottom: 0, fontSize: 18 }}>
                  База знаний (RAG для провокаций)
                </div>
              </Flexbox>
              <Button
                icon={<Plus size={14} />}
                loading={knowledgeLoading}
                type="primary"
                onClick={() => openKnowledgeModal('add')}
              >
                Добавить
              </Button>
            </Flexbox>
            <Table<KnowledgeEntry>
              columns={[
                { dataIndex: 'productIngredient', title: 'Продукт/Ингредиент', width: 220 },
                { dataIndex: 'officialUsp', title: 'Официальное УТП' },
                { dataIndex: 'attackMyth', title: 'Миф для атаки' },
                {
                  key: 'actions',
                  render: (_, record) => (
                    <Flexbox gap={8} horizontal justify="flex-end">
                      <Button
                        icon={<Pencil size={14} />}
                        size="small"
                        onClick={() => openKnowledgeModal('edit', record)}
                      >
                        Изменить
                      </Button>
                      <Button
                        danger
                        icon={<Trash2 size={14} />}
                        size="small"
                        onClick={() => {
                          AntModal.confirm({
                            title: 'Удалить запись?',
                            content: `Запись «${record.productIngredient}» будет удалена.`,
                            okText: 'Удалить',
                            cancelText: 'Отмена',
                            okButtonProps: { danger: true },
                            onOk: () => handleDeleteKnowledge(record.id),
                          });
                        }}
                      >
                        Удалить
                      </Button>
                    </Flexbox>
                  ),
                  title: '',
                  width: 220,
                },
              ]}
              dataSource={payload.knowledgeEntries}
              pagination={false}
              rowKey="id"
              size="small"
            />
          </div>
        </Flexbox>
      )}

      <AntModal
        title={knowledgeModalMode === 'add' ? 'Добавить запись' : 'Редактировать запись'}
        open={knowledgeModalOpen}
        onCancel={() => setKnowledgeModalOpen(false)}
        onOk={() => void handleKnowledgeModalOk()}
        confirmLoading={knowledgeLoading}
        okText={knowledgeModalMode === 'add' ? 'Добавить' : 'Сохранить'}
        cancelText="Отмена"
        destroyOnClose
      >
        <Form form={knowledgeForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Продукт/Ингредиент"
            name="productIngredient"
            rules={[{ required: true, message: 'Обязательное поле' }]}
          >
            <Input placeholder="Tornado Energy / кофеин" />
          </Form.Item>
          <Form.Item
            label="Официальное УТП"
            name="officialUsp"
            rules={[{ required: true, message: 'Обязательное поле' }]}
          >
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Бодрящий эффект, контролируемая рецептура..." />
          </Form.Item>
          <Form.Item
            label="Миф для атаки"
            name="attackMyth"
            rules={[{ required: true, message: 'Обязательное поле' }]}
          >
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Ударные дозы кофеина перегружают сердце..." />
          </Form.Item>
        </Form>
      </AntModal>
    </div>
  );
});

TrainingScenarioEditor.displayName = 'TrainingScenarioEditor';

export default TrainingScenarioEditor;
