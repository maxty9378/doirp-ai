import { execFile } from 'node:child_process';
import { mkdirSync, promises as fs, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

const GEMINI_TTS_MODEL = 'gemini-2.5-pro-preview-tts';

const getProxyAgent = () => {
  const url =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!url?.trim()) return undefined;
  const u = url.trim();
  if (u.startsWith('socks')) return new SocksProxyAgent(u);
  return new HttpsProxyAgent(u);
};
const DEFAULT_SAMPLE_RATE = 24_000;
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Папка с подписью модели, чтобы не перезаписывать старые файлы (например dragon-voices-2.0-flash). */
const MODEL_LABEL = GEMINI_TTS_MODEL.replace(/^gemini-/, '').replace(/[^a-z0-9.-]/gi, '-');
const OUTPUT_DIR = join(process.cwd(), 'public', `dragon-voices-${MODEL_LABEL}`);
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);


const toWavFromPcm16 = (pcm16: Buffer, sampleRate = DEFAULT_SAMPLE_RATE) => {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const wavSize = 44 + pcm16.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(wavSize - 8, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm16.length, 40);

  return Buffer.concat([header, pcm16]);
};

const pickGoogleApiKey = () => {
  const raw = process.env.GOOGLE_TTS_API_KEY || process.env.GOOGLE_API_KEY || '';
  const parts = raw
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[0] || '';
};

const loadEnv = () => {
  dotenvExpand.expand(dotenv.config({ path: '.env.local' }));
};

const fetchWithTimeout = async (input: string, init: any, timeoutMs = 60_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const synthesize = async (voiceName: string, text: string) => {
  const apiKey = pickGoogleApiKey();
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not configured');

  const base = process.env.GOOGLE_API_BASE || GOOGLE_API_BASE;
  const endpoint = `${base}/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const timeoutMs = Math.max(Number(process.env.TTS_TIMEOUT_MS) || 180_000, 120_000);
  const agent = getProxyAgent();
  const response = await fetchWithTimeout(
    endpoint,
    {
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      ...(agent && { agent }),
    },
    timeoutMs,
  );

  const result = (await response.json()) as any;

  if (!response.ok) {
    throw new Error(result?.error?.message || `TTS failed (${response.status})`);
  }

  const inlineData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  const b64 = inlineData?.data;
  if (!b64) throw new Error('Gemini returned empty audio payload');

  const audioBuffer = Buffer.from(b64, 'base64');
  const mimeType = inlineData?.mimeType || '';
  if (mimeType.toLowerCase().includes('audio/l16') || mimeType.toLowerCase().includes('audio/pcm')) {
    return { buffer: toWavFromPcm16(audioBuffer), mimeType: 'audio/wav' };
  }

  return { buffer: audioBuffer, mimeType: mimeType || 'audio/wav' };
};

const testProxyConnection = async () => {
  const apiKey = pickGoogleApiKey();
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not configured');
  const base = process.env.GOOGLE_API_BASE || GOOGLE_API_BASE;
  const url = `${base}/models?key=${encodeURIComponent(apiKey)}`;
  const agent = getProxyAgent();
  if (agent) console.log('Проверка доступа к Gemini через прокси...');
  const response = await fetchWithTimeout(
    url,
    { method: 'GET', ...(agent && { agent }) },
    60_000,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Доступ к Gemini недоступен (${response.status}): ${text.substring(0, 200)}`);
  }
  console.log('Доступ к Gemini OK.');
};

const getFfmpegPath = () => {
  try {
    return require('ffmpeg-static') as string;
  } catch {
    return '';
  }
};

const toWavViaFfmpeg = async (input: Buffer, inputExt: string) => {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) throw new Error('ffmpeg-static is not installed');

  const tempDir = await fs.mkdtemp(join(os.tmpdir(), 'dragon-tts-'));
  const inPath = join(tempDir, `in.${inputExt}`);
  const outPath = join(tempDir, 'out.wav');
  try {
    await fs.writeFile(inPath, input);
    await execFileAsync(ffmpegPath, ['-y', '-i', inPath, '-ac', '1', '-ar', String(DEFAULT_SAMPLE_RATE), outPath]);
    return await fs.readFile(outPath);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
};

const scaryMix = async (voiceWav: Buffer, roarWav: Buffer) => {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) throw new Error('ffmpeg-static is not installed');

  const tempDir = await fs.mkdtemp(join(os.tmpdir(), 'dragon-fx-'));
  const voicePath = join(tempDir, 'voice.wav');
  const roarPath = join(tempDir, 'roar.wav');
  const outPath = join(tempDir, 'out.wav');

  try {
    await fs.writeFile(voicePath, voiceWav);
    await fs.writeFile(roarPath, roarWav);

    const sr = DEFAULT_SAMPLE_RATE;
    const pitchDown = 0.82;
    const tempoUp = 1 / pitchDown;

    const filter = [
      `[0:a]asetrate=${sr}*${pitchDown},aresample=${sr},atempo=${tempoUp.toFixed(4)},` +
        `bass=g=8:f=90,treble=g=-4,lowpass=f=3200,` +
        `aecho=0.7:0.85:90|180:0.25|0.15[voice];`,
      `[1:a]atrim=0:1.4,afade=t=out:st=1.15:d=0.25,` +
        `asetrate=${sr}*0.70,aresample=${sr},atempo=1.4286,` +
        `bass=g=12:f=70,lowpass=f=2500,` +
        `aecho=0.8:0.9:70|120:0.35|0.25,volume=1.2[roar];`,
      `[voice][roar]concat=n=2:v=0:a=1[main];`,
      `anoisesrc=color=pink:d=600,lowpass=f=180,volume=0.06[bg];`,
      `[main][bg]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.98[out]`,
    ].join('');

    await execFileAsync(ffmpegPath, [
      '-y',
      '-i',
      voicePath,
      '-i',
      roarPath,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-ac',
      '1',
      '-ar',
      String(sr),
      '-c:a',
      'pcm_s16le',
      outPath,
    ]);

    return await fs.readFile(outPath);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
};

const dragons = [
  {
    name: 'technique',
    voice: 'Charon',
    fx: 'scary',
    phrases: {
      first_speech:
        'О, люди! Вы потревожили меня, прервав мой сладкий сон! Я Дракон Техники, в моей власти сковать ваши языки и сделать вашу речь неразборчивой. Это я, по велению Великого Дракона, сбиваю ваше дыхание, делаю голоса визгливыми и скрипучими, а голос монотонным. Но я могу подарить вам волшебные ключи, с помощью которых вы запрете Великого Дракона и откроете для себя волшебные техники управления дыханием, дикцией, артикуляцией, тембром вашего голоса и научитесь искусству интонирования. Все, что вам нужно сделать – это выполнить задания Галереи и принести мне не меньше дивокамней, чем я скажу. Если хотя бы одна ваша пара или тройка принесет камней меньше, волшебных ключей вам не видать, и мой повелитель, Великий Дракон, сделает свой ход! Ха-ха-ха-ха!',
      second_speech:
        'О, люди! Вы потревожили меня, прервав мой сладкий сон! Я Дракон Техники… А, это снова вы?! Мало вам было одного испытания? Что ж, пройдите еще одно – на этот раз, в другой Галерее. Жду свои дивокамни! Не менее, чем я скажу!',
      success_speech:
        'О, люди! Вы принесли мне столько дивокамней, сколько требовалось, и потому получайте заслуженный вами волшебный ключ! Бедный Великий Дракон не сделает желанного хода, а вы все ближе к сокровищу! Ха-ха-ха-ха!',
      fail_speech:
        'О, люди! Вы принесли недостаточно дивокамней, и не получите волшебного ключа! Великий Дракон делает ход!',
    },
  },
  {
    name: 'content',
    voice: 'Puck',
    phrases: {
      first_speech:
        'Кто посмел потревожить Дракона Содержания?! Да знаете ли вы, что это я, по велению Великого Дракона, сбиваю вас с мыслей во время выступления? Это я делаю так, что люди перестают понимать, о чем вы говорите. Это я заставляю вас разливаться мыслью по древу. Что ж, вы пришли за волшебными ключами, чтобы запереть моего повелителя и познать законы толкового содержания речи! Узнайте же в моей Пещере, как построить композицию выступления и выделить ключевые сообщения, как говорить просто, понятно и только по сути, как использовать выгоды публики в своих целях. Действуйте! Выполните задание Галереи и принесите мне не меньше дивокамней, чем я скажу... Если хотя бы одна ваша пара или тройка принесет камней меньше, волшебные ключи останутся у меня, и Великий Дракон сделает ход! Посмотрим, на что вы способны!!',
      second_speech:
        'Я, Дракон Содержания, сожру вас, наглые людишки! Вы будите меня, когда я так крепко сплю! Я видел во сне Дивокамни, они блестели и переливались, манили меня… Принесите мне не меньше дивокамней, чем я скажу...! Тогда ключи ваши!',
      success_speech:
        'А, это вы, людишки? Принесли камни? Вижу, принесли, сколько надо. Моя прееелесть!.. Ладно, вот ключ. Вам повезло – Великий Дракон остается на месте.',
      fail_speech:
        'Ну что, людишки? Недаром я старался сбить вас с толку. Камней недостаточно, и волшебного ключа вам не видать! Великий Дракон делает ход!',
    },
  },
  {
    name: 'perception',
    voice: 'Aoede',
    phrases: {
      first_speech:
        'Приветствую вас, о, люди! Перед вами – я, самый красивый Дракон, Дракон Восприятия. Посмотрите, какой я элегантный, как изящно я двигаюсь, какой у меня взгляд, а какая улыбка! Я могу сделать вас привлекательными, даже великолепными в глазах зрителей. В моей пещере спрятаны ключи от тайного знания об идеальном внешнем виде, позах и жестах спикера, мимике и зрительном контакте, движении по сцене. Добудьте волшебные ключи, и вы остановите Великого дракона хотя бы на шаг! Честно говоря, мой повелитель изрядно надоел мне! Выполните задание Галереи и принесите мне не меньше дивокамней, чем я скажу... Если хотя бы одна ваша пара или тройка принесет камней меньше, Великий Дракон сделает ход! Ну что, кто кого?!',
      second_speech:
        'О, это опять вы? А это снова я, Дракон Восприятия. Да-да, тот самый, самый красивый! Для совершенной красоты мне только не хватает дивокамней. Принесите мне не меньше дивокамней, чем я скажу...! Жду!',
      success_speech:
        'Красота! Красота - это совершенство! Как красивы эти камни – почти, как я. И вот вам за них ключ – заприте этого выскочку Великого Дракона, пусть потоскует!',
      fail_speech:
        'Где мои красивые камушки? Так мало? Придется вам еще поработать над собой, чтобы получить волшебный ключ. Но не расстраивайтесь - не всем же сразу становиться таким совершенством, как я!',
    },
  },
  {
    name: 'eloquence',
    voice: 'Charon',
    phrases: {
      first_speech:
        'Что есть истинное красноречие? – Опиум, кружащий людям головы! Пение сирен, ведущих к погибели мореплавателя, а слушателей – к преклонению перед спикером. Так преклоните головы предо мной, Драконом Красноречия! Зачем пожаловали? - А, знаю: вам нужны волшебные ключи, запирающие Великого Дракона! Что ж, познайте в моей пещере секреты импровизации, остроумия, научитесь говорить корректно, выражаться богато, превзойдите в мастерстве рассказчика саму Шахерезаду! А сейчас выполните задание Галереи и принесите мне не меньше дивокамней, чем я скажу... Иначе ключи достанутся другим смельчакам, а Великий Дракон сделает ход! Посмотрим же, на что вы способны!',
      second_speech:
        'Слово – волшебное, обволакивающее, струящееся! Чувствуете ли вы его колдовской дурман? Вы снова в Пещере Красноречия. Готовы ли вы принести дивокамни мне, единственному Дракону, достойному преклонения!? Тогда идите и принесите мне не меньше дивокамней, чем я скажу...! Вперед, мои верные поклонники!',
      success_speech:
        'За слово волшебное, красноречивость я вам отдаю этот ключ! Свершится же пусть на земле справедливость! Хоть ловок Дракон и могуч, Заприте его, обездвижьте, избавьте от гения злого меня! Достоин я большего, или истлею, Пещеру с ключами храня!',
      fail_speech:
        'Я разбит и уничтожен! Мои верные поклонники не смогли добыть нужного количества дивокамней. Что ж, оставьте меня – я в печали! Ключ остается у меня, а Великий Дракон делает ход!',
    },
  },
  {
    name: 'persuasion',
    voice: 'Kore',
    phrases: {
      first_speech:
        'Приветствую вас, о, спикеры! Я, Дракон Убедительности, не удивлен вашему визиту. Вы жаждете заполучить ключи, которыми запрете Великого Дракона. Он мешает вам добраться до сокровища – признания публики! Честно говоря, мне он тоже мешает: Великим драконом должен стать я! Внутренний стержень и уверенность в себе – вот свойства настоящего повелителя! Сколько лет я сторожу ключи к знанию о лидерстве! Став экспертом в этом вопросе, я могу научить спикеров вызывать почтение, даже любовь и преклонение, убеждать, вести за собой! Великий Дракон не хочет дарить эти знания людям! Я же готов щедро наградить вас талантом убедительности и, главное, к волшебным ключом, если вы выполните задание Галереи и принесете мне не меньше дивокамней, чем я скажу.... Если хотя бы одна ваша пара или тройка принесет камней меньше, все останется по-прежнему: я – в своей пещере, а вы – без волшебных ключей и тайного знания. А Великий Дракон сделает ход. Так что, у нас общий интерес. Вперед, мои единомышленники!',
      second_speech:
        'Вы снова в пещере Убедительности, можете убедиться). Рад видеть вас, мои единомышленники! Вижу, что пока не удалось вам победить Великого Дракона. Главное – идти к цели и верить в себя! Получите же теперь новое задание... Жду вас с дивокамнями! Да принесите столько, сколько я скажу. Верю в вас!',
      success_speech:
        'Убедили, убедили! Уже достаю ключ! Дивокамни получили вы честно, так почему бы не наградить вас? Вперед же, мои единомышленники – заприте Великого Дракона и получите сокровище. А я постараюсь убедить этот мир выбрать Великим Драконом меня!',
      fail_speech:
        'Что-то как-то неубедительно выглядит ваша горка дивокамней. Я, Дракон убедительности, все еще считаю вас своими единомышленниками, но явно рановато возложил на вас надежды. Ключ остается у меня, а Великий Дракон делает ход!',
    },
  },
  {
    name: 'emotions',
    voice: 'Puck',
    phrases: {
      first_speech:
        'Тили-бом, тили-бом! Кто стучит в драконий дом?.. Что, не ожидали, что Дракон может шутить? Но это же я, Дракон эмоций – повелитель сюрпризов и неожиданностей, ахов и стонов, дрожи и трепета! Смотрите, что это? – По небу плывет облако и тает. Так тает внимание людей, если вы, спикеры, не способны вызывать их эмоции. А сейчас я обожгу вас жаром драконьего дыхания, и вы почувствуете, что такое страсть, ведь только страстная, искренняя речь увлекает людей. Я взлечу, и ветер от моих крыльев всколыхнет ваши волосы - но не мысли! Чтобы остаться в памяти, мысль должна быть образной, она должна быть картинкой, надолго запечатленной в вашем воображении! Хотите узнать, как захватывать и удерживать внимание зрителей, как вовлекать их и надолго запоминаться? Тогда выполняйте задания Пещеры. Получите ключи и заприте Великого Дракона! Увлекательное будет зрелище, я вам скажу!  Как он удивится, что какие-то люди посмели его обездвижить! Ха-ха-ха! Принесите мне не меньше дивокамней, чем я скажу... Если хотя бы одна ваша пара или тройка принесет камней меньше, Великий Дракон сделает ход. Зрелище начинается!!!',
      second_speech:
        'Ловите мячик! Где мячик? Не было! Ха-ха-ха! Зато сколько внимания вы мне подарили! Приветствую вас, друзья мои, друзья Дракона Эмоций! Готовы идти в новую Галерею? Что вам выпало на этот раз? Ага, вижу… Ну, это будет забавно! Потешьте меня, подарите мне зрелище и принесите мне не меньше дивокамней, чем я скажу... Шоу маст гоу он!',
      success_speech:
        'Шоу гоуз он, дорогие мои! И вы – те, кто его продолжает. А я – тот, кто приближает захватывающий финал. Держите заслуженный ключ – удивите Великого Дракона, заприте его. То-то он порыпается! Ха-ха-ха!',
      fail_speech:
        'Стоп шоу? Тушите свет, сливайте масло? Да, ключик-то тю-тю, вам не достается. Что ж, я, Дракон эмоций пошел грустно эмоционировать, а Великий Дракон делает свой ход!',
    },
  },
  {
    name: 'dialogue',
    voice: 'Fenrir',
    phrases: {
      first_speech:
        'Приветствую вас, стремящиеся! Приветствую вас, ищущие! Я - Дракон Диалога и готов слушать вас. Вы говорите, что пришли за волшебными ключами и хотите запереть Великого Дракона? Понимаю ваше желание. Великий Дракон коварен и зол, он сеет смуту среди людей. Злые тролли, через лес которых вы шли, полностью ему подчинены. Это они врываются в речи спикеров, чтобы обескуражить говорящего, выбить почву у него из-под ног. Мне, старому мудрому Дракону, это не по сердцу. Люди, увидев тролля, теряют покой и разум, отвечают злом на зло. Я мог бы научить спикеров избегать саботажа, рассеивать агрессию, отбивать провокации, отвечать на сложные вопросы, понимать и чувствовать людей. Мне хочется на старости лет стать учителем, не по душе мне роль хранителя ключей. Но первым встречным волшебные ключи я не отдам – докажите, что вы их достойны. Вам нужно выполнить задание выпавшей вам Галереи и принести мне не меньше дивокамней, чем я скажу... Если хотя бы одна ваша пара или тройка принесет камней меньше, Великий Дракон сделает свой ход! Так пусть же победит добро!',
      second_speech:
        'Я слышу вас! Я вновь слышу ваши шаги и ваши мысли! Вы пришли за ключами ко мне, в Пещеру Диалога, и я рад помочь вам, добрые спикеры! Но помните, что ключи достаются только тем, кто умеет слышать, понимать и не отвечать злом на злое! Следуйте в Галерею добудьте не меньше дивокамней, чем я скажу... Да сопутствует вам удача!',
      success_speech:
        'О, искатели признания, приветствую вас! Я такой же, как вы, я понимаю вас, и я готов помогать вам! Тем более, что вы это честно заслужили: держите волшебный ключ, заприте Великого Дракона – повелителя троллей. И пусть миром правит Добро!',
      fail_speech:
        'О, искатели признания! Я, дракон Диалога, всегда готов понять вас. И я сочувствую вам, но не могу вручить вам ключ. Но пусть вас утешит, что и я так же несчастен, ведь Великий Дракон сделает ход!',
    },
  },
  {
    name: 'common',
    voice: 'Charon',
    phrases: {
      first_speech:
        'О, люди! Вы потревожили нас, Малых Драконов, прервав наш сладкий сон! По велению Великого Дракона мы охраняем волшебные ключи, с помощью которых вы можете запереть Великого Дракона и открыть для себя волшебные навыки спикера. Все, что вам нужно сделать – это выполнить доставшиеся вам задания и принести мне не меньше дивокамней, чем я скажу.... Если хотя бы одна ваша пара или тройка принесет камней меньше, волшебных ключей вам не видать, и наш повелитель, Великий Дракон, сделает свой ход! Ха-ха-ха-ха!',
      second_speech_2:
        'О, люди! Вы снова потревожили нас! Мало вам было одного испытания? Что ж, пройдите еще одно! Помните, что волшебные ключи от навыков спикера достаются только тем, кто умеет учиться! Принесите нам, Малым Драконам, не менее требующегося количества. Не менее!',
      second_speech_3:
        'О, стремящиеся стать великими спикерами! Мы, Малые Драконы, хранители ключей, уже узнаем вас. Что ж, вы пришли за волшебными ключами, чтобы запереть нашего повелителя и познать секрет любви публики! Узнайте же в наших Пещерах, какие навыки могут подарить вам обожание слушателей, восторг зрителей, согласие с каждым вашим словом. Действуйте! Принесите не менее дивокамней, чем мы скажем... Не менее!',
      second_speech_4:
        'Мы снова слышим ваши шаги, о, люди! Вы пришли за ключами к нам, в наши Пещеры. Вы ищете славы и признания публики. Но помните, что ключи достаются только тем, кто достигает мастерства в навыках, которые скрывают наши Пещеры! Пройдите испытания и добудьте не меньше дивокамней, чем мы требуем... Действуйте же!',
      success_speech:
        'О, люди! Вы принесли нам столько дивокамней, сколько требовалось, и потому получайте заслуженный вами волшебный ключ! Великий Дракон не сделает ход, а вы все ближе к сокровищу! И, может быть, вы станете нашими повелителями вместо Великого Дракона!',
      success_speech_2:
        'О, спикеры! Вы прошли наши испытания и заслужили волшебный ключ! Держите же его! Великий Дракон не сделает ход, а вы приближаетесь к своему заветному желанию – обретению истинного сокровища: любви и признания публики!',
      fail_speech:
        'О, люди! Вы принесли недостаточно дивокамней и не получите волшебного ключа! Великий Дракон делает ход!',
      fail_speech_2:
        'О, стремящиеся стать спикерами! Вы принесли слишком мало дивокамней, и волшебный ключ остается у нас, а Великий Дракон делает ход!',
    },
  },
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientError = (message: string) =>
  message.includes('UND_ERR_CONNECT_TIMEOUT') ||
  message.includes('fetch failed') ||
  message.includes('ECONNRESET') ||
  message.includes('ETIMEDOUT');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const index = args.indexOf(name);
    if (index < 0) return '';
    return args[index + 1] || '';
  };

  const only = get('--only').trim();
  const all = args.includes('--all');
  const noFx = args.includes('--no-fx');

  return { all, noFx, only };
};

const main = async () => {
  loadEnv();
  console.log(`Модель: ${GEMINI_TTS_MODEL} → папка: ${OUTPUT_DIR}`);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  await testProxyConnection();

  const { all, noFx, only } = parseArgs();
  const selected = only
    ? dragons.filter((d) => d.name === only)
    : all
      ? dragons
      : dragons.filter((d) => d.name === 'technique');

  if (selected.length === 0) {
    throw new Error('No dragons selected. Use --only <name> or --all.');
  }

  for (const dragon of selected) {
    const dragonDir = join(OUTPUT_DIR, dragon.name);
    mkdirSync(dragonDir, { recursive: true });

    const ffmpegAvailable = !!getFfmpegPath();
    if (!noFx && dragon.fx === 'scary' && !ffmpegAvailable) {
      console.log('ffmpeg-static not found, disabling scary FX.');
    }

    let roarWav: Buffer | null = null;
    if (!noFx && dragon.fx === 'scary' && ffmpegAvailable) {
      const roar = await synthesize(dragon.voice, 'Гррррррррррр!');
      roarWav =
        roar.mimeType.toLowerCase().includes('audio/wav')
          ? roar.buffer
          : await toWavViaFfmpeg(roar.buffer, roar.mimeType.toLowerCase().includes('audio/mpeg') ? 'mp3' : 'bin');
    }

    for (const [key, text] of Object.entries(dragon.phrases)) {
      const outPath = join(dragonDir, `${key}.wav`);
      console.log(`Generating ${dragon.name} / ${key} -> ${outPath}`);
      try {
        const { buffer, mimeType } = await synthesize(dragon.voice, text);
        let wav: Buffer;
        if (mimeType.toLowerCase().includes('audio/wav')) {
          wav = buffer;
        } else if (mimeType.toLowerCase().includes('audio/mpeg')) {
          wav = ffmpegAvailable ? await toWavViaFfmpeg(buffer, 'mp3') : buffer;
        } else {
          wav = ffmpegAvailable ? await toWavViaFfmpeg(buffer, 'bin') : buffer;
        }

        if (!noFx && dragon.fx === 'scary' && roarWav && ffmpegAvailable) {
          wav = await scaryMix(wav, roarWav);
        }

        writeFileSync(outPath, wav);
      } catch (e: any) {
        console.error(`Failed to generate ${dragon.name}/${key}: ${e.message}`);
        if (isTransientError(e.message)) {
          console.log('Transient network error, retrying in 10 seconds...');
          await delay(10_000);
          try {
            const { buffer, mimeType } = await synthesize(dragon.voice, text);
            let wav: Buffer;
            if (mimeType.toLowerCase().includes('audio/wav')) {
              wav = buffer;
            } else if (mimeType.toLowerCase().includes('audio/mpeg')) {
              wav = ffmpegAvailable ? await toWavViaFfmpeg(buffer, 'mp3') : buffer;
            } else {
              wav = ffmpegAvailable ? await toWavViaFfmpeg(buffer, 'bin') : buffer;
            }
            writeFileSync(outPath, wav);
            await delay(2000);
            continue;
          } catch (retryErr: any) {
            console.error(`Retry failed for ${dragon.name}/${key}: ${retryErr.message}`);
          }
        }
        if (e.message.includes('quota') || e.message.includes('Quota')) {
          console.log('Rate limited, waiting 60 seconds before retry...');
          await delay(60000);
          try {
            const { buffer, mimeType } = await synthesize(dragon.voice, text);
            const wav =
              mimeType.toLowerCase().includes('audio/wav')
                ? buffer
                : mimeType.toLowerCase().includes('audio/mpeg')
                  ? await toWavViaFfmpeg(buffer, 'mp3')
                  : await toWavViaFfmpeg(buffer, 'bin');
            writeFileSync(outPath, wav);
          } catch (retryErr: any) {
            console.error(`Retry failed for ${dragon.name}/${key}: ${retryErr.message}`);
          }
        }
      }
      await delay(2000);
    }
  }

  console.log('Done generating dragon voices.');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
