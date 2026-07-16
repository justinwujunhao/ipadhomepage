import { createServer as createHttpServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = Number(process.env.PORT || 8787);
const DEFAULT_HOST = process.env.HOST || '0.0.0.0';
const WEATHER_CACHE_MS = 15 * 60 * 1000;

const WEATHER_CODES = new Map([
  [0, '晴朗'],
  [1, '大部晴朗'],
  [2, '局部多云'],
  [3, '阴天'],
  [45, '有雾'],
  [48, '雾凇'],
  [51, '小毛毛雨'],
  [53, '毛毛雨'],
  [55, '较强毛毛雨'],
  [61, '小雨'],
  [63, '中雨'],
  [65, '大雨'],
  [71, '小雪'],
  [73, '中雪'],
  [75, '大雪'],
  [80, '阵雨'],
  [81, '较强阵雨'],
  [82, '强阵雨'],
  [95, '雷雨'],
  [96, '雷雨伴冰雹'],
  [99, '强雷雨伴冰雹']
]);

export const defaultState = {
  settings: {
    title: '家里的小看板',
    cityName: '广东省佛山市',
    latitude: 23.0215,
    longitude: 113.1214,
    backgroundImage: ''
  },
  messages: [
    {
      id: 'msg_welcome',
      text: '欢迎回来，今天也慢慢来。',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  todos: [
    {
      id: 'todo_sample',
      text: '把想提醒家人的事情写在管理页里',
      done: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  weather: {
    status: 'idle',
    updatedAt: null,
    error: null,
    current: null,
    daily: null
  }
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(payload);
}

function textResponse(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    const total = chunks.reduce((size, item) => size + item.length, 0);
    if (total > 1024 * 1024) {
      throw Object.assign(new Error('Request body is too large'), { status: 413 });
    }
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

function normalizeState(input) {
  const state = cloneDefaultState();
  const source = input && typeof input === 'object' ? input : {};

  state.settings = {
    ...state.settings,
    ...(source.settings && typeof source.settings === 'object' ? source.settings : {})
  };
  state.settings.latitude = Number(state.settings.latitude) || defaultState.settings.latitude;
  state.settings.longitude = Number(state.settings.longitude) || defaultState.settings.longitude;

  state.messages = Array.isArray(source.messages) ? source.messages.filter(Boolean) : state.messages;
  state.todos = Array.isArray(source.todos) ? source.todos.filter(Boolean) : state.todos;
  state.weather = {
    ...state.weather,
    ...(source.weather && typeof source.weather === 'object' ? source.weather : {})
  };

  return state;
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function cleanText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function weatherSummary(code) {
  return WEATHER_CODES.get(Number(code)) || '天气更新中';
}

function buildWeatherUrl(settings) {
  const params = new URLSearchParams({
    latitude: String(settings.latitude),
    longitude: String(settings.longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '1'
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function mapWeatherPayload(payload) {
  const current = payload.current || {};
  const daily = payload.daily || {};
  const dailyCode = Array.isArray(daily.weather_code) ? daily.weather_code[0] : undefined;
  const currentCode = current.weather_code ?? dailyCode;

  return {
    status: 'ok',
    updatedAt: new Date().toISOString(),
    error: null,
    current: {
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      weatherCode: currentCode,
      summary: weatherSummary(currentCode)
    },
    daily: {
      maxTemperature: Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null,
      minTemperature: Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null,
      precipitationProbability: Array.isArray(daily.precipitation_probability_max)
        ? daily.precipitation_probability_max[0]
        : null,
      weatherCode: dailyCode,
      summary: weatherSummary(dailyCode ?? currentCode)
    }
  };
}

export async function createApp(options = {}) {
  const rootDir = options.rootDir || __dirname;
  const publicDir = options.publicDir || path.join(rootDir, 'public');
  const dataDir = options.dataDir || path.join(rootDir, 'data');
  const dataFile = options.dataFile || path.join(dataDir, 'state.json');
  const enableWeather = options.enableWeather !== false;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  let state = cloneDefaultState();
  let weatherPromise = null;

  async function saveState() {
    await mkdir(path.dirname(dataFile), { recursive: true });
    await writeFile(dataFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  async function loadState() {
    try {
      const raw = await readFile(dataFile, 'utf8');
      state = normalizeState(JSON.parse(raw));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = cloneDefaultState();
      await saveState();
    }
  }

  async function refreshWeather({ force = false } = {}) {
    if (!enableWeather || typeof fetchImpl !== 'function') return state.weather;

    const lastUpdated = state.weather.updatedAt ? Date.parse(state.weather.updatedAt) : 0;
    if (!force && state.weather.status === 'ok' && Date.now() - lastUpdated < WEATHER_CACHE_MS) {
      return state.weather;
    }

    if (weatherPromise) return weatherPromise;

    weatherPromise = (async () => {
      try {
        const response = await fetchImpl(buildWeatherUrl(state.settings), {
          headers: { accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`Weather service returned ${response.status}`);

        const payload = await response.json();
        state.weather = mapWeatherPayload(payload);
        await saveState();
      } catch (error) {
        state.weather = {
          ...state.weather,
          status: state.weather.current ? 'stale' : 'error',
          updatedAt: state.weather.updatedAt,
          error: error.message || 'Weather update failed'
        };
        await saveState();
      } finally {
        weatherPromise = null;
      }

      return state.weather;
    })();

    return weatherPromise;
  }

  async function sendStatic(req, res, pathname) {
    const routePath = pathname === '/' ? '/index.html' : pathname === '/admin' ? '/admin.html' : pathname;
    const decoded = decodeURIComponent(routePath);
    const filePath = path.normalize(path.join(publicDir, decoded));

    if (!filePath.startsWith(publicDir)) {
      textResponse(res, 403, 'Forbidden');
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        textResponse(res, 404, 'Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const body = await readFile(filePath);
      res.writeHead(200, {
        'content-type': MIME_TYPES[ext] || 'application/octet-stream',
        'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=60'
      });
      res.end(body);
    } catch (error) {
      if (error.code === 'ENOENT') {
        textResponse(res, 404, 'Not found');
      } else {
        textResponse(res, 500, 'Internal server error');
      }
    }
  }

  async function handleApi(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/api/state') {
      void refreshWeather();
      jsonResponse(res, 200, state);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/messages') {
      const body = await readJsonBody(req);
      const text = cleanText(body.text);
      if (!text) {
        jsonResponse(res, 400, { error: 'Message text is required' });
        return;
      }

      const now = new Date().toISOString();
      const existing = state.messages.find((message) => message.id === body.id);
      if (existing) {
        existing.text = text;
        existing.updatedAt = now;
      } else {
        state.messages.unshift({ id: makeId('msg'), text, createdAt: now, updatedAt: now });
      }
      await saveState();
      jsonResponse(res, 200, state);
      return;
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/messages/')) {
      const id = decodeURIComponent(url.pathname.replace('/api/messages/', ''));
      state.messages = state.messages.filter((message) => message.id !== id);
      await saveState();
      jsonResponse(res, 200, state);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/todos') {
      const body = await readJsonBody(req);
      const text = cleanText(body.text, 300);
      if (!text) {
        jsonResponse(res, 400, { error: 'Todo text is required' });
        return;
      }

      const now = new Date().toISOString();
      const existing = state.todos.find((todo) => todo.id === body.id);
      if (existing) {
        existing.text = text;
        existing.done = Boolean(body.done);
        existing.updatedAt = now;
      } else {
        state.todos.unshift({
          id: makeId('todo'),
          text,
          done: Boolean(body.done),
          createdAt: now,
          updatedAt: now
        });
      }
      await saveState();
      jsonResponse(res, 200, state);
      return;
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/todos/')) {
      const id = decodeURIComponent(url.pathname.replace('/api/todos/', ''));
      state.todos = state.todos.filter((todo) => todo.id !== id);
      await saveState();
      jsonResponse(res, 200, state);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const body = await readJsonBody(req);
      state.settings = {
        ...state.settings,
        title: cleanText(body.title, 80) || state.settings.title,
        cityName: cleanText(body.cityName, 80) || state.settings.cityName,
        backgroundImage: cleanText(body.backgroundImage, 300),
        latitude: Number(body.latitude) || state.settings.latitude,
        longitude: Number(body.longitude) || state.settings.longitude
      };
      await saveState();
      void refreshWeather({ force: true });
      jsonResponse(res, 200, state);
      return;
    }

    jsonResponse(res, 404, { error: 'Not found' });
  }

  await loadState();
  void refreshWeather({ force: true });

  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
        return;
      }
      await sendStatic(req, res, url.pathname);
    } catch (error) {
      jsonResponse(res, error.status || 500, { error: error.message || 'Internal server error' });
    }
  });

  return {
    server,
    getState: () => state,
    refreshWeather
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await createApp();
  app.server.listen(DEFAULT_PORT, DEFAULT_HOST, () => {
    console.log(`Home iPad board is running at http://localhost:${DEFAULT_PORT}`);
    console.log(`On the iPad, open http://<mac-mini-ip>:${DEFAULT_PORT}`);
  });
}
