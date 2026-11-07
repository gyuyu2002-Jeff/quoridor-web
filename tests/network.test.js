import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomClient } from '../src/network.js';
import { roomService } from './room-test-helpers.js';

test('two clients create, join, synchronize moves and restore after a refresh', async (t) => {
  const service = roomService();
  const blue = new RoomClient(() => {}, service.fetcher);
  const pink = new RoomClient(() => {}, service.fetcher);
  const restored = new RoomClient(() => {}, service.fetcher);
  t.after(() => { blue.disconnect(); pink.disconnect(); restored.disconnect(); service.sqlite.close(); });
  await blue.connect();
  assert.equal(blue.snapshot.player, 0);
  await pink.connect(blue.session.code);
  await blue.poll();
  assert.equal(blue.snapshot.ready, true);
  await blue.act('actions', { type: 'move', to: { r: 7, c: 4 } });
  await pink.poll();
  assert.deepEqual(blue.snapshot.game, pink.snapshot.game);
  const identity = { ...blue.session };
  blue.disconnect();
  await restored.connect(identity.code, identity);
  assert.equal(restored.snapshot.player, 0);
  assert.equal(restored.snapshot.game.ply, 1);
});

test('a dropped response after an accepted move resynchronizes without duplicating it', async (t) => {
  const service = roomService();
  let dropNextAction = false;
  const blue = new RoomClient(() => {}, async (url, options) => {
    const response = await service.fetcher(url, options);
    if (dropNextAction && url.endsWith('/actions')) { dropNextAction = false; throw new TypeError('network lost after commit'); }
    return response;
  });
  const pink = new RoomClient(() => {}, service.fetcher);
  t.after(() => { blue.disconnect(); pink.disconnect(); service.sqlite.close(); });
  await blue.connect(); await pink.connect(blue.session.code); await blue.poll();
  dropNextAction = true;
  await blue.act('actions', { type: 'move', to: { r: 7, c: 4 } });
  assert.equal(blue.connected, true);
  assert.equal(blue.snapshot.game.ply, 1);
  assert.equal(blue.snapshot.game.turn, 1);
});

test('out-of-order snapshots cannot roll the board back', () => {
  const client = new RoomClient(() => {});
  client.accept({ revision: 5, game: { ply: 4 } });
  client.accept({ revision: 3, game: { ply: 2 } });
  assert.equal(client.snapshot.revision, 5);
});

test('a late connection response cannot resurrect a room after leaving', async (t) => {
  const service = roomService();
  let release;
  const responseReady = new Promise((resolve) => { release = resolve; });
  const client = new RoomClient(() => {}, async (url, options) => {
    const response = await service.fetcher(url, options);
    await responseReady;
    return response;
  });
  t.after(() => { client.disconnect(); service.sqlite.close(); });
  const connecting = client.connect();
  client.disconnect();
  release();
  await connecting;
  assert.equal(client.session, null);
  assert.equal(client.snapshot, null);
  assert.equal(client.timer, null);
});
