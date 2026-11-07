import { createGame, movePawn, placeWall } from '../src/game.js';

const roomAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomPattern = /^[A-HJ-NP-Z2-9]{6}$/;
const tokenPattern = /^[a-f0-9-]{36}$/i;
const allowedOrigins = new Set(['https://gyuyu2002-jeff.github.io', 'https://quoridor-duel-gy-1107.taupegecko2.chatgpt.site']);
const roomLifetime = 24 * 60 * 60 * 1000;

class RoomError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new RoomError(status, message); };
const hashToken = async (token) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), (b) => b.toString(16).padStart(2, '0')).join('');

async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > 2048) fail(413, '資料太大。');
  const text = await request.text();
  if (text.length > 2048) fail(413, '資料太大。');
  let body;
  try { body = JSON.parse(text); } catch { fail(400, '無法讀取操作資料。'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, '操作資料格式不正確。');
  return body;
}

function publicRoom(row, player, now) {
  return {
    code: row.code, game: JSON.parse(row.game), revision: row.revision, round: row.round,
    player, ready: Boolean(row.pink_key), closed: Boolean(row.closed), expiresAt: row.expires_at,
    opponentOnline: now - (player === 0 ? row.pink_seen : row.blue_seen) < 15000,
    rematchRequested: [Boolean(row.rematch & 1), Boolean(row.rematch & 2)],
  };
}

export async function handleRoomApi(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
  if (allowedOrigins.has(origin) || origin === url.origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Access-Control-Max-Age'] = '600';
  }
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  try {
    if (origin && !headers['Access-Control-Allow-Origin']) fail(403, '請從遊戲網站開啟連線對戰。');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method === 'GET' && url.pathname === '/api/health') {
      await env.DB.prepare('SELECT code FROM rooms LIMIT 1').first();
      return json({ ok: true, version: '1.2.0' });
    }
    const now = Date.now();
    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      const body = await readBody(request);
      if (!tokenPattern.test(body.token ?? '')) fail(400, '玩家識別資料不正確。');
      const key = await hashToken(body.token);
      await env.DB.prepare('DELETE FROM rooms WHERE expires_at < ?').bind(now).run();
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => roomAlphabet[b % 32]).join('');
        const result = await env.DB.prepare('INSERT OR IGNORE INTO rooms (code, blue_key, game, expires_at, blue_seen) VALUES (?, ?, ?, ?, ?)')
          .bind(code, key, JSON.stringify(createGame()), now + roomLifetime, now).run();
        if (result.meta.changes) {
          const row = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
          return json(publicRoom(row, 0, now), 201);
        }
      }
      fail(503, '暫時無法建立房間，請稍後再試。');
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|actions|rematch|leave))?$/);
    if (!match || !roomPattern.test(match[1])) fail(404, '找不到房間，請確認六碼房號。');
    const [, code, operation] = match;
    let row = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
    if (!row || row.expires_at <= now) fail(404, '房間不存在或已過期，請重新建立。');
    if (!['GET', 'POST'].includes(request.method)) fail(405, '不支援的操作。');
    const body = request.method === 'POST' ? await readBody(request) : {};
    const token = operation === 'join' ? body.token : request.headers.get('Authorization')?.replace(/^Bearer /, '');
    if (!tokenPattern.test(token ?? '')) fail(401, '缺少玩家識別，請重新加入房間。');
    const key = await hashToken(token);
    let player = row.blue_key === key ? 0 : row.pink_key === key ? 1 : -1;
    if (operation === 'join' && request.method === 'POST') {
      if (row.closed) fail(410, '這個房間已關閉，請建立新房間。');
      if (player === -1) {
        if (row.pink_key) fail(409, '房間已滿，請確認是否為朋友提供的房號。');
        const joined = await env.DB.prepare('UPDATE rooms SET pink_key = ?, pink_seen = ?, revision = revision + 1 WHERE code = ? AND pink_key IS NULL AND closed = 0')
          .bind(key, now, code).run();
        if (!joined.meta.changes) fail(409, '房間已被另一位玩家加入。');
        player = 1;
      }
      row = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
      return json(publicRoom(row, player, now));
    }
    if (player === -1) fail(403, '你不是這個房間的玩家。');
    if (request.method === 'GET' && !operation) {
      const seenColumn = player === 0 ? 'blue_seen' : 'pink_seen';
      if (now - row[seenColumn] > 5000) await env.DB.prepare(`UPDATE rooms SET ${seenColumn} = ? WHERE code = ?`).bind(now, code).run();
      return json(publicRoom(row, player, now));
    }
    if (request.method !== 'POST' || !operation) fail(405, '不支援的操作。');
    if (operation === 'leave') {
      await env.DB.prepare('UPDATE rooms SET closed = 1, revision = revision + 1 WHERE code = ? AND closed = 0').bind(code).run();
      return json({ closed: true });
    }
    if (row.closed) fail(410, '對手已離開，請建立新房間。');
    if (!row.pink_key) fail(409, '等待朋友加入後才能開始。');
    if (!Number.isInteger(body.revision) || body.revision !== row.revision) fail(409, '棋局已更新，請同步後再試一次。');
    const game = JSON.parse(row.game);
    let nextGame = game, rematch = row.rematch, round = row.round;
    if (operation === 'actions') {
      if (game.winner !== null) fail(409, '這局已結束，可以邀請對手再來一局。');
      if (game.turn !== player) fail(403, '還沒輪到你，請等待對手。');
      let result;
      if (body.type === 'move' && body.to && Number.isInteger(body.to.r) && Number.isInteger(body.to.c)) result = movePawn(game, { r: body.to.r, c: body.to.c });
      else if (body.type === 'wall' && body.wall) result = placeWall(game, { r: body.wall.r, c: body.wall.c, o: body.wall.o });
      else fail(400, '請選擇合法的移動或放牆操作。');
      if (!result.ok) fail(400, result.reason);
      nextGame = result.state;
      rematch = 0;
    } else if (operation === 'rematch') {
      rematch |= 1 << player;
      if (rematch === 3) { nextGame = createGame(); rematch = 0; round++; }
    } else fail(404, '找不到這項操作。');
    const updated = await env.DB.prepare('UPDATE rooms SET game = ?, rematch = ?, round = ?, revision = revision + 1 WHERE code = ? AND revision = ? AND closed = 0')
      .bind(JSON.stringify(nextGame), rematch, round, code, row.revision).run();
    if (!updated.meta.changes) fail(409, '棋局已更新，請同步後再試一次。');
    row = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
    return json(publicRoom(row, player, now));
  } catch (error) {
    if (error instanceof RoomError) return json({ error: error.message }, error.status);
    console.error('Room API failed:', error.message);
    return json({ error: '連線服務暫時無法使用，請稍後重試。' }, 503);
  }
}
