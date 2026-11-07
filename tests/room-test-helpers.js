import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleRoomApi } from '../worker/api.js';

export function roomService() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_rooms.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''));
  const DB = { prepare(sql) {
    const statement = sqlite.prepare(sql);
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return statement.get(...values) ?? null; },
      async run() { const result = statement.run(...values); return { meta: { changes: Number(result.changes) } }; },
    };
  } };
  const fetcher = (url, options) => handleRoomApi(new Request(url, options), { DB });
  const call = async (path, method = 'GET', body, token, origin) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (origin) headers.Origin = origin;
    const response = await fetcher(`https://quoridor-duel-gy-1107.taupegecko2.chatgpt.site/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: response.status === 204 ? null : await response.json(), headers: response.headers };
  };
  return { sqlite, fetcher, call };
}

export async function readyRoom(service) {
  const blue = crypto.randomUUID(), pink = crypto.randomUUID();
  const created = await service.call('/rooms', 'POST', { token: blue });
  const code = created.data.code;
  const joined = await service.call(`/rooms/${code}/join`, 'POST', { token: pink });
  return { code, blue, pink, state: joined.data };
}
