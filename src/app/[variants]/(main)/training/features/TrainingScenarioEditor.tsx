'use client';

import { Flexbox, Form, type FormGroupItemType, Icon } from '@lobehub/ui';
import { Button, Input, InputNumber, Select, Switch, Table, message } from 'antd';
import { createStyles } from 'antd-style';
import { Loader2, Pencil, Plus, Trash2, Save, Upload } from 'lucide-react';
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
}));

const SCENARIO_OPTIONS = [
  { label: 'GFD: Стресс-интервью на выставке', value: 'training-gfd-stress' },
];

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
  systemPrompt: string | null;
  analyzePrompt: string | null;
  debriefPrompt: string | null;
  assistantLabel: string | null;
  userLabel: string | null;
  voiceName: string | null;
  bannerUrl: string | null;
  contextWindow: number | null;
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
        systemPrompt: data.scenario.systemPrompt ?? '',
        analyzePrompt: data.scenario.analyzePrompt ?? '',
        debriefPrompt: data.scenario.debriefPrompt ?? '',
        assistantLabel: data.scenario.assistantLabel ?? '',
        userLabel: data.scenario.userLabel ?? '',
        voiceName: data.scenario.voiceName ?? '',
        bannerUrl: data.scenario.bannerUrl ?? '',
        contextWindow: data.scenario.contextWindow ?? 5,
        silenceNudgeAfterMs: data.scenario.silenceNudgeAfterMs ?? 5000,
        silenceNudgeCooldownMs: data.scenario.silenceNudgeCooldownMs ?? 15000,
      // В форме редактируем в секундах, в БД храним миллисекунды
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
          systemPrompt: values.systemPrompt || null,
          analyzePrompt: values.analyzePrompt || null,
          debriefPrompt: values.debriefPrompt || null,
          assistantLabel: values.assistantLabel || null,
          userLabel: values.userLabel || null,
          voiceName: values.voiceName || null,
          bannerUrl: values.bannerUrl || null,
          contextWindow: values.contextWindow ?? null,
          silenceNudgeAfterMs: values.silenceNudgeAfterMs ?? null,
          silenceNudgeCooldownMs: values.silenceNudgeCooldownMs ?? null,
          // Пользователь вводит секунды, сервер ожидает миллисекунды
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

  const handleAddKnowledge = useCallback(async () => {
    if (!payload?.scenario?.id) return;
    setKnowledgeLoading(true);
    try {
      const productIngredient = prompt('Продукт/Ингредиент:');
      if (productIngredient == null || !productIngredient.trim()) {
        setKnowledgeLoading(false);
        return;
      }
      const officialUsp = prompt('Официальное УТП:');
      if (officialUsp == null || !officialUsp.trim()) {
        setKnowledgeLoading(false);
        return;
      }
      const attackMyth = prompt('Миф для атаки:');
      if (attackMyth == null || !attackMyth.trim()) {
        setKnowledgeLoading(false);
        return;
      }
      const res = await fetch('/api/admin/training/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          scenarioId: payload.scenario.id,
          productIngredient: productIngredient.trim(),
          officialUsp: officialUsp.trim(),
          attackMyth: attackMyth.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      message.success('Запись добавлена');
      void loadScenario(payload.scenario.key);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Не удалось добавить');
    } finally {
      setKnowledgeLoading(false);
    }
  }, [message, payload, loadScenario]);

  const handleEditKnowledge = useCallback(
    async (entry: KnowledgeEntry) => {
      if (!payload?.scenario?.key) return;
      const productIngredient = prompt('Продукт/Ингредиент:', entry.productIngredient) ?? '';
      const officialUsp = prompt('Официальное УТП:', entry.officialUsp) ?? '';
      const attackMyth = prompt('Миф для атаки:', entry.attackMyth) ?? '';
      if (!productIngredient.trim() || !officialUsp.trim() || !attackMyth.trim()) return;
      setKnowledgeLoading(true);
      try {
        const res = await fetch('/api/admin/training/knowledge', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            id: entry.id,
            productIngredient: productIngredient.trim(),
            officialUsp: officialUsp.trim(),
            attackMyth: attackMyth.trim(),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || res.statusText);
        }
        message.success('Запись обновлена');
        void loadScenario(payload.scenario.key);
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Не удалось обновить');
      } finally {
        setKnowledgeLoading(false);
      }
    },
    [message, payload, loadScenario],
  );

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
      title: 'Основные настройки',
      children: [
        {
          label: 'Название',
          desc: 'Название тренажёра',
          children: <Input placeholder="Название тренажёра" />,
          name: 'title',
          minWidth: undefined,
        },
        {
          label: 'Описание',
          desc: 'Краткое описание',
          children: (
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 4 }}
              placeholder="Краткое описание"
            />
          ),
          name: 'description',
        },
        {
          label: 'Голос',
          desc: 'Выберите голос для озвучки',
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
          desc: 'Загрузите картинку баннера, URL заполнится автоматически',
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
          desc: 'Включен ли тренажёр для пользователей',
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
    title: 'Легенда и Роль',
    children: [
      {
        label: 'Легенда',
        desc: 'Что видит пользователь перед стартом',
        children: <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="Текст легенды" />,
        name: 'legend',
      },
      {
        label: 'Роль пользователя',
        desc: 'Кто вы в сценарии',
        children: <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Кто вы в сценарии" />,
        name: 'userRole',
      },
      {
        label: 'Цели',
        desc: 'Каждая цель с новой строки',
        children: <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="Цель 1\nЦель 2" />,
        name: 'goals',
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
    title: 'Настройки ИИ',
    children: [
      {
        label: 'Системный промпт',
        desc: 'Инструкции для ИИ-агента',
        children: <Input.TextArea autoSize={{ minRows: 8, maxRows: 20 }} placeholder="Инструкции для ИИ-агента" />,
        name: 'systemPrompt',
      },
      {
        label: 'Метка ассистента',
        desc: 'Например: Журналистка-расследователь',
        children: <Input placeholder="Например: Журналистка-расследователь" />,
        name: 'assistantLabel',
        minWidth: undefined,
      },
      {
        label: 'Метка пользователя',
        desc: 'Например: Вы (Маркетолог GFD)',
        children: <Input placeholder="Например: Вы (Маркетолог GFD)" />,
        name: 'userLabel',
        minWidth: undefined,
      },
      {
        label: 'Окно контекста (реплик)',
        desc: 'Количество сохраняемых реплик',
        children: <InputNumber min={1} max={20} style={{ width: 120 }} />,
        name: 'contextWindow',
        minWidth: undefined,
      },
    ],
  }), []);

  const promptsAfterCallGroup: FormGroupItemType = useMemo(() => ({
    title: 'Промпты после звонка',
    children: [
      {
        label: 'Промпт анализа сессии',
        desc: 'Инструкция для LLM при разборе транскрипта после звонка. Подставка транскрипта: {{transcript}}',
        children: <Input.TextArea autoSize={{ minRows: 6, maxRows: 16 }} placeholder="Оставьте пустым для стандартного промпта" />,
        name: 'analyzePrompt',
      },
      {
        label: 'Промпт дебрифа',
        desc: 'Инструкция для краткого разбора (2 ошибки, 1 сильная сторона). Подставка: {{transcript}}',
        children: <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} placeholder="Оставьте пустым для стандартного промпта" />,
        name: 'debriefPrompt',
      },
    ],
  }), []);

  const silenceGroup: FormGroupItemType = useMemo(() => ({
    title: 'Обработка тишины',
    children: [
      {
        label: 'Подсказка при паузе через (мс)',
        desc: 'Через сколько миллисекунд после тишины прозвучит первая подсказка',
        children: <InputNumber min={1000} step={1000} style={{ width: 120 }} />,
        name: 'silenceNudgeAfterMs',
        minWidth: undefined,
      },
      {
        label: 'Кулдаун подсказки (мс)',
        desc: 'Минимальная задержка между подсказками при тишине',
        children: <InputNumber min={1000} step={1000} style={{ width: 120 }} />,
        name: 'silenceNudgeCooldownMs',
        minWidth: undefined,
      },
      {
        label: 'Время раунда (сек)',
        desc: 'Через сколько минут максимум звонок завершится автоматически',
        children: <InputNumber min={30} step={30} style={{ width: 120 }} />,
        name: 'silenceHardHangupMs',
        minWidth: undefined,
      },
      {
        label: 'Фразы при тишине',
        desc: 'Каждая с новой строки. В эфире используют молчание против собеседника.',
        children: (
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder="Что, аргументы закончились? Камера всё еще пишет, вы в курсе?\nЗрители ждут ответа, не молчите."
          />
        ),
        name: 'silenceNudgePhrases',
      },
    ],
  }), []);

  const extraGroup: FormGroupItemType = useMemo(() => ({
    title: 'Дополнительно',
    children: [
      {
        label: 'Чекпоинты',
        desc: 'Включить сохранение прогресса',
        children: <Switch />,
        name: 'enableCheckpoints',
        valuePropName: 'checked',
        minWidth: undefined,
      },
      {
        label: 'Оценка',
        desc: 'Включить скоринг результатов',
        children: <Switch />,
        name: 'enableScoring',
        valuePropName: 'checked',
        minWidth: undefined,
      },
    ],
  }), []);

  const scoreDisplayGroup: FormGroupItemType = useMemo(() => ({
    title: 'Индикатор оценки (уровень стресса)',
    children: [
      {
        label: 'Подпись индикатора',
        desc: 'Например: Градус провокации, Уровень стресса, Оценка клиента',
        children: <Input placeholder="Градус провокации" />,
        name: 'scoreDisplayLabel',
        minWidth: undefined,
      },
      {
        label: 'Подпись при низком счёте (score < -10)',
        desc: 'Например: Нужно улучшить',
        children: <Input placeholder="Нужно улучшить" />,
        name: 'scoreLevelLow',
        minWidth: undefined,
      },
      {
        label: 'Подпись при среднем счёте (-10..10)',
        desc: 'Например: Неплохо',
        children: <Input placeholder="Неплохо" />,
        name: 'scoreLevelMid',
        minWidth: undefined,
      },
      {
        label: 'Подпись при высоком счёте (> 10)',
        desc: 'Например: Отлично',
        children: <Input placeholder="Отлично" />,
        name: 'scoreLevelHigh',
        minWidth: undefined,
      },
    ],
  }), []);

  const openingInstructionGroup: FormGroupItemType = useMemo(() => ({
    title: 'Первая реплика ИИ',
    children: [
      {
        label: 'Инструкция на старт диалога',
        desc: 'Плейсхолдеры: {{assistantLabel}}, {{nameLine}} (или {{speakerInstruction}}). Пусто — стандартный текст.',
        children: (
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 8 }}
            placeholder="Начинай интервью. Представься коротко как {{assistantLabel}} и произнеси первую реплику..."
          />
        ),
        name: 'openingInstruction',
      },
    ],
  }), []);

  const introDialogGroup: FormGroupItemType = useMemo(() => ({
    title: 'Диалог представления (имя/позывной)',
    children: [
      {
        label: 'Показывать диалог представления',
        children: <Switch />,
        name: 'showIntroDialog',
        minWidth: undefined,
      },
      {
        label: 'Заголовок диалога',
        children: <Input placeholder="Идентификация агента" />,
        name: 'introDialogTitle',
        minWidth: undefined,
      },
      {
        label: 'Описание',
        children: (
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder="Введите позывной или реальное имя для старта симуляции..."
          />
        ),
        name: 'introDialogDescription',
      },
      {
        label: 'Плейсхолдер поля имени',
        children: <Input placeholder="Например: Иван Петров или «Маркетолог GFD»" />,
        name: 'introDialogPlaceholder',
        minWidth: undefined,
      },
      {
        label: 'Подсказка под полем',
        children: (
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 3 }}
            placeholder="Можно указать реальное имя или рабочий позывной агента..."
          />
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
    title: 'Промпты во время звонка',
    children: [
      {
        label: 'Предупреждение перед концом раунда',
        children: (
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 6 }}
            placeholder="Через 15 секунд наш эфир на конференции подходит к концу..."
          />
        ),
        name: 'roundEndingPrompt',
      },
      {
        label: 'Шаблон подсказки при тишине',
        children: (
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder='Собеседник молчит. Скажи коротко: "{{phrase}}".'
          />
        ),
        name: 'silenceNudgeTemplate',
        extra: 'Используйте плейсхолдер {{phrase}} — подставится фраза из списка «Фразы при тишине».',
      },
      {
        label: 'Подсказка «отвечай короче»',
        children: (
          <Input.TextArea
            autoSize={{ minRows: 1, maxRows: 3 }}
            placeholder="Отвечай короче: 1-2 предложения и по сути..."
          />
        ),
        name: 'shortAnswerNudge',
      },
      {
        label: 'Подсказка «собеседник говорит тихо»',
        children: (
          <Input.TextArea
            autoSize={{ minRows: 1, maxRows: 3 }}
            placeholder="Собеседник говорит очень тихо и неуверенно..."
          />
        ),
        name: 'quietSpeakerNudge',
      },
      {
        label: 'Промпт при авто-успехе',
        children: (
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder="Маркетолог справился с напором. Признай поражение иронично и заверши эфир..."
          />
        ),
        name: 'autoSuccessPrompt',
      },
    ],
  }), []);

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
          <div className={styles.sectionTitle} style={{ marginBottom: 0, fontSize: 24 }}>Настройки сценария</div>
          {!hideSelector && (
            <Select
              allowClear
              options={SCENARIO_OPTIONS}
              placeholder="Выберите тренажёр для редактирования"
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
              promptsAfterCallGroup,
              silenceGroup,
              extraGroup,
              scoreDisplayGroup,
              openingInstructionGroup,
              introDialogGroup,
              inCallPromptsGroup,
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
              <div className={styles.sectionTitle} style={{ marginBottom: 0, fontSize: 18 }}>
                База знаний (RAG для провокаций)
              </div>
              <Button
                icon={<Plus size={14} />}
                loading={knowledgeLoading}
                type="primary"
                onClick={() => void handleAddKnowledge()}
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
                        onClick={() => void handleEditKnowledge(record)}
                      >
                        Изменить
                      </Button>
                      <Button
                        danger
                        icon={<Trash2 size={14} />}
                        size="small"
                        onClick={() => {
                          if (confirm('Удалить запись?')) void handleDeleteKnowledge(record.id);
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
    </div>
  );
});

TrainingScenarioEditor.displayName = 'TrainingScenarioEditor';

export default TrainingScenarioEditor;

