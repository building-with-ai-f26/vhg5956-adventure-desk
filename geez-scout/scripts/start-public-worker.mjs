import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { setTimeout as wait } from 'node:timers/promises';

const site = 'https://geez-group-qa.vic-gausepoh-9451.chatgpt.site';
const local = 'http://127.0.0.1:8792';
const workflow = 'scouting_pivot_v1';
const workerId = randomUUID();
const shutdown = new AbortController();
const cookies = new Map();
let localAuthUntil = 0;
let modelCheckUntil = 0;
let lastState = '';
process.on('SIGINT', () => shutdown.abort());
process.on('SIGTERM', () => shutdown.abort());

const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
const line = (await input[Symbol.asyncIterator]().next()).value;
input.close();
const { token } = JSON.parse(line ?? '{}');
const localPassword = process.env.GEEZ_DEMO_PASSWORD || 'Geez-demo-2026';
if (!/^[a-f0-9]{64}$/.test(token ?? '') || typeof localPassword !== 'string' || !localPassword) {
  throw Error('Provide bridge credentials through standard input.');
}

function status(information) {
  if (lastState === information) return;
  lastState = information;
  console.log(information);
}

class HttpError extends Error {
  constructor(scope, code) {
    super(scope + ' HTTP ' + code);
    this.code = code;
  }
}

async function request(origin, path, data, headers = {}, signal = shutdown.signal) {
  const response = await fetch(origin + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { ...headers, ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
    body: data === undefined ? undefined : JSON.stringify(data),
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (!response.ok) throw new HttpError(origin === site ? 'Site worker' : 'Loopback app', response.status);
  return response;
}

async function remote(route, packet) {
  return (await request(site, '/api/scout-worker/' + route, { worker_id: workerId, ...packet }, {
    authorization: 'Bearer ' + token,
  })).json();
}

async function loopback(path, data, signal) {
  const response = await request(local, path, data, {
    origin: local,
    cookie: Array.from(cookies, ([name, value]) => name + '=' + value).join('; '),
  }, signal);
  for (const header of response.headers.getSetCookie()) {
    const [name, value] = header.split(';', 1)[0].split('=');
    cookies.set(name, value);
  }
  return response.json();
}

async function ready() {
  if (Date.now() >= localAuthUntil) {
    const health = await loopback('/api/health');
    if (health.workflow !== workflow) throw Error('The expected local app is not running.');
    await loopback('/api/login', { password: localPassword });
    const { session } = await loopback('/api/me');
    if (!session) await loopback('/api/session', { name: 'Public Geez worker', save: false });
    localAuthUntil = Date.now() + 6 * 60 * 60_000;
  }
  if (Date.now() >= modelCheckUntil) {
    const modelStatus = await loopback('/api/demo-status');
    if (modelStatus.test_mode || modelStatus.workflow !== workflow ||
        !Array.isArray(modelStatus.models) || modelStatus.models.length !== 2 ||
        !modelStatus.models.every(model => model.available && model.local_only)) {
      throw Error('The two pinned local models are unavailable.');
    }
    modelCheckUntil = Date.now() + 60_000;
    return !modelStatus.busy;
  }
  return true;
}

async function runLocal(work, signal, update) {
  const { query, notes, category, messages } = work.input;
  const thesis = work.kind === 'thesis';
  const packet = thesis ? { draft: query, messages } : { query, intent: 'sourcing' };
  let created;
  while (!created) {
    try {
      created = await loopback(thesis ? '/api/thesis' : '/api/research', {
        ...packet, notes, category, idempotency_key: work.id,
      }, signal);
    } catch (error) {
      if (error.code !== 409) throw error;
      await wait(5000, undefined, { signal });
    }
  }
  const path = '/api/research/' + created.job.id;
  try {
    let job = created.job;
    while (job.status === 'running') {
      update(job.progress?.phase);
      await wait(4000, undefined, { signal });
      job = (await loopback(path, undefined, signal)).job;
    }
    if (job.status !== 'completed' || !job.result || job.result.test_only !== false) {
      throw Error('The real local workflow did not complete.');
    }
    return job.result;
  } finally {
    if (signal.aborted) {
      try { await loopback(path + '/cancel', {}, new AbortController().signal); } catch { /* The local job may already be terminal. */ }
    }
  }
}

async function finish(work) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, shutdown.signal]);
  let phase;
  let packet;
  let execution;
  let lastContact = Date.now();
  const lease = { id: work.id, lease: work.lease };
  try {
    const granted = await remote('sync', lease);
    if (!granted.active) return;
    execution = runLocal(work, signal, value => { phase = value; }).then(
      result => { packet = { result }; },
      () => { packet = { failed: true }; },
    );
    while (!signal.aborted) {
      try {
        const sent = packet;
        const response = await remote('sync', { ...lease, phase, ...sent });
        lastContact = Date.now();
        if (!response.active) {
          status('Public job status: ' + response.status);
          return;
        }
      } catch (error) {
        if (packet && (error.code === 400 || error.code === 413)) packet = { failed: true };
        if (error.code === 401 || error.code === 404 || Date.now() - lastContact > 85_000) throw error;
      }
      await wait(packet ? 1000 : 8000, undefined, { signal });
    }
  } finally {
    controller.abort();
    await execution;
  }
}

while (!shutdown.signal.aborted) {
  try {
    if (await ready()) {
      const { job } = await remote('claim', { workflow });
      status('Connected to the public Geez queue. Both pinned local models are available.');
      if (job) await finish(job);
    }
  } catch (error) {
    if (!shutdown.signal.aborted) status(error instanceof HttpError ? error.message : 'Worker connection or local runtime unavailable.');
  }
  try { await wait(8000, undefined, { signal: shutdown.signal }); } catch { break; }
}
