import test from 'node:test';
import assert from 'node:assert/strict';
import { roomService, readyRoom } from './room-test-helpers.js';
import { chooseComputerAction } from '../src/ai.js';

test('creates an authenticated room without exposing player keys', async (t) => {
  const s = roomService(); t.after(() => s.sqlite.close());
  const token = crypto.randomUUID();
  const created = await s.call('/rooms', 'POST', { token });
  assert.equal(created.status, 201);
  assert.match(created.data.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(created.data.ready, false);
  assert.equal(created.data.player, 0);
  assert.equal(JSON.stringify(created.data).includes(token), false);
  assert.equal('blue_key' in created.data, false);
  const unauthenticated = await s.call(`/rooms/${created.data.code}`);
  assert.equal(unauthenticated.status, 401);
  const premature = await s.call(`/rooms/${created.data.code}/actions`, 'POST', { type: 'move', to: { r: 7, c: 4 }, revision: 0 }, token);
  assert.equal(premature.status, 409);
});

test('joining is idempotent for the same identity and rejects a third player', async (t) => {
  const s = roomService(); t.after(() => s.sqlite.close());
  const r = await readyRoom(s);
  const again = await s.call(`/rooms/${r.code}/join`, 'POST', { token: r.pink });
  assert.equal(again.status, 200);
  assert.equal(again.data.player, 1);
  assert.equal(again.data.revision, r.state.revision);
  const third = await s.call(`/rooms/${r.code}/join`, 'POST', { token: crypto.randomUUID() });
  assert.equal(third.status, 409);
  const intruder = await s.call(`/rooms/${r.code}`, 'GET', null, crypto.randomUUID());
  assert.equal(intruder.status, 403);
});

test('concurrent joins cannot claim the same seat', async (t) => {
  const s = roomService(); t.after(() => s.sqlite.close());
  const created = await s.call('/rooms', 'POST', { token: crypto.randomUUID() });
  const results = await Promise.all([1, 2].map(() => s.call(`/rooms/${created.data.code}/join`, 'POST', { token: crypto.randomUUID() })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});

test('server rejects wrong turns, illegal moves and forged game state', async (t) => {
  const s = roomService(); t.after(() => s.sqlite.close());
  const r = await readyRoom(s);
  const move = { type: 'move', to: { r: 7, c: 4 }, revision: r.state.revision };
  assert.equal((await s.call(`/rooms/${r.code}/actions`, 'POST', move, r.pink)).status, 403);
  assert.equal((await s.call(`/rooms/${r.code}/actions`, 'POST', { ...move, to: { r: 0, c: 4 } }, r.blue)).status, 400);
  assert.equal((await s.call(`/rooms/${r.code}/actions`, 'POST', { ...move, to: null }, r.blue)).status, 400);
  const legal = await s.call(`/rooms/${r.code}/actions`, 'POST', { ...move, game: { winner: 0 }, player: 1 }, r.blue);
  assert.equal(legal.status, 200);
  assert.equal(legal.data.game.winner, null);
  assert.deepEqual(legal.data.game.pawns[0], { r: 7, c: 4 });
  assert.equal(legal.data.game.turn, 1);
});

test('duplicate requests apply a move exactly once and reject stale revisions', async (t) => {
  const s = roomService(); t.after(() => s.sqlite.close());
  const r = await readyRoom(s);
  const body = { type: 'move', to: { r: 7, c: 4 }, revision: r.state.revision };
  const results = await Promise.all([1, 2].map(() => s.call(`/rooms/${r.code}/actions`, 'POST', body, r.blue)));
  assert.deepEqual(results.map((v) => v.status).sort(), [200, 409]);
  const current = await s.call(`/rooms/${r.code}`, 'GET', null, r.pink);
  assert.equal(current.data.game.ply, 1);
  assert.equal(current.data.revision, r.state.revision + 1);
});

test('wall placement synchronizes and crossing walls are rejected by the server', async (t) => {
  const s = roomService(); t.after(() => s.sqlite.close());
  const r = await readyRoom(s);
  const placed = await s.call(`/rooms/${r.code}/actions`, 'POST', { type: 'wall', wall: { r: 3, c: 3, o: 'h' }, revision: r.state.revision }, r.blue);
  assert.equal(placed.status, 200);
  const pinkView = await s.call(`/rooms/${r.code}`, 'GET', null, r.pink);
  assert.deepEqual(pinkView.data.game, placed.data.game);
  assert.equal(pinkView.data.game.remaining[0], 9);
  const crossed = await s.call(`/rooms/${r.code}/actions`, 'POST', { type: 'wall', wall: { r: 3, c: 3, o: 'v' }, revision: placed.data.revision }, r.pink);
  assert.equal(crossed.status, 400);
  assert.match(crossed.data.error, /重疊或交叉/);
});

test('rematch requires both players and only then resets the shared board', async (t) => {
  const s = roomService(); t.after(() => s.sqlite.close());
  const r = await readyRoom(s);
  const moved = await s.call(`/rooms/${r.code}/actions`, 'POST', { type: 'move', to: { r: 7, c: 4 }, revision: r.state.revision }, r.blue);
  const requested = await s.call(`/rooms/${r.code}/rematch`, 'POST', { revision: moved.data.revision }, r.blue);
  assert.equal(requested.data.game.ply, 1);
  assert.deepEqual(requested.data.rematchRequested, [true, false]);
  const accepted = await s.call(`/rooms/${r.code}/rematch`, 'POST', { revision: requested.data.revision }, r.pink);
  assert.equal(accepted.data.game.ply, 0);
  assert.equal(accepted.data.round, 2);
  assert.deepEqual(accepted.data.rematchRequested, [false, false]);
});

test('refresh with the same identity resumes the game; offline presence is reported', async (t) => {
  const s = roomService(); t.after(() => s.sqlite.close());
  const r = await readyRoom(s);
  await s.call(`/rooms/${r.code}/actions`, 'POST', { type: 'move', to: { r: 7, c: 4 }, revision: r.state.revision }, r.blue);
  s.sqlite.prepare('UPDATE rooms SET pink_seen = 0 WHERE code = ?').run(r.code);
  const resumed = await s.call(`/rooms/${r.code}`, 'GET', null, r.blue);
  assert.equal(resumed.data.player, 0);
  assert.equal(resumed.data.game.ply, 1);
  assert.equal(resumed.data.opponentOnline, false);
  await s.call(`/rooms/${r.code}`, 'GET', null, r.pink);
  assert.equal((await s.call(`/rooms/${r.code}`, 'GET', null, r.blue)).data.opponentOnline, true);
});

test('leaving closes the room and expired rooms cannot be resumed', async (t) => {
  const s = roomService(); t.after(() => s.sqlite.close());
  const r = await readyRoom(s);
  assert.equal((await s.call(`/rooms/${r.code}/leave`, 'POST', {}, r.blue)).status, 200);
  assert.equal((await s.call(`/rooms/${r.code}`, 'GET', null, r.pink)).data.closed, true);
  assert.equal((await s.call(`/rooms/${r.code}/join`, 'POST', { token: r.blue })).status, 410);
  s.sqlite.prepare('UPDATE rooms SET expires_at = 0 WHERE code = ?').run(r.code);
  assert.equal((await s.call(`/rooms/${r.code}`, 'GET', null, r.pink)).status, 404);
});

test('CORS permits the public GitHub game and rejects unrelated web origins', async (t) => {
  const s = roomService(); t.after(() => s.sqlite.close());
  const origin = 'https://gyuyu2002-jeff.github.io';
  const preflight = await s.call('/rooms', 'OPTIONS', null, null, origin);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal((await s.call('/rooms', 'POST', { token: crypto.randomUUID() }, null, 'https://unrelated.example')).status, 403);
});

test('two authenticated clients complete a full match with identical final boards', async (t) => {
  const s = roomService(); t.after(() => s.sqlite.close());
  const r = await readyRoom(s);
  let state = r.state;
  for (let i = 0; i < 160 && state.game.winner === null; i++) {
    const action = chooseComputerAction(state.game);
    const response = await s.call(`/rooms/${r.code}/actions`, 'POST', { ...action, revision: state.revision }, state.game.turn === 0 ? r.blue : r.pink);
    assert.equal(response.status, 200);
    state = response.data;
  }
  assert.notEqual(state.game.winner, null);
  const a = await s.call(`/rooms/${r.code}`, 'GET', null, r.blue);
  const b = await s.call(`/rooms/${r.code}`, 'GET', null, r.pink);
  assert.deepEqual(a.data.game, b.data.game);
  assert.equal((await s.call(`/rooms/${r.code}/actions`, 'POST', { type: 'move', to: { r: 4, c: 4 }, revision: state.revision }, r.blue)).status, 409);
});
