import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../server.js';

async function startTestServer() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'home-board-'));
  const app = await createApp({
    dataDir: tempDir,
    dataFile: path.join(tempDir, 'state.json'),
    enableWeather: false
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: () => new Promise((resolve) => app.server.close(resolve))
  };
}

test('state API returns default board state', async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/state`);
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.equal(state.settings.cityName, '广东省佛山市');
    assert.equal(Array.isArray(state.messages), true);
    assert.equal(Array.isArray(state.todos), true);
  } finally {
    await server.close();
  }
});

test('messages and todos can be created, updated, and deleted', async () => {
  const server = await startTestServer();
  try {
    const messageResponse = await fetch(`${server.baseUrl}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '今晚有汤' })
    });
    const messageState = await messageResponse.json();
    const message = messageState.messages.find((item) => item.text === '今晚有汤');
    assert.ok(message);

    const todoResponse = await fetch(`${server.baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '买牛奶' })
    });
    const todoState = await todoResponse.json();
    const todo = todoState.todos.find((item) => item.text === '买牛奶');
    assert.ok(todo);

    const doneResponse = await fetch(`${server.baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: todo.id, text: todo.text, done: true })
    });
    const doneState = await doneResponse.json();
    assert.equal(doneState.todos.find((item) => item.id === todo.id).done, true);

    const deleteResponse = await fetch(`${server.baseUrl}/api/messages/${message.id}`, {
      method: 'DELETE'
    });
    const deleteState = await deleteResponse.json();
    assert.equal(deleteState.messages.some((item) => item.id === message.id), false);
  } finally {
    await server.close();
  }
});

test('settings update persists board configuration', async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '门口小屏',
        cityName: '广东省佛山市',
        latitude: 23.0215,
        longitude: 113.1214,
        backgroundImage: '/assets/background.jpg'
      })
    });
    const state = await response.json();
    assert.equal(state.settings.title, '门口小屏');
    assert.equal(state.settings.backgroundImage, '/assets/background.jpg');
  } finally {
    await server.close();
  }
});
