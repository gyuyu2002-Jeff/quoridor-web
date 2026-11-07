export const ONLINE_ORIGIN = 'https://quoridor-duel-gy-1107.taupegecko2.chatgpt.site';
export const PLAY_URL = 'https://gyuyu2002-jeff.github.io/quoridor-web/';

export class RoomClient {
  constructor(onChange, fetcher = (...args) => fetch(...args)) {
    this.onChange = onChange;
    this.fetcher = fetcher;
    this.session = null;
    this.snapshot = null;
    this.connected = false;
    this.busy = false;
    this.error = '';
    this.timer = null;
    this.generation = 0;
  }

  async request(path, method = 'GET', body, session = this.session) {
    const headers = { 'Content-Type': 'application/json' };
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    const response = await this.fetcher(`${ONLINE_ORIGIN}/api/rooms${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || '連線失敗，請再試一次。');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  accept(snapshot) {
    if (!this.snapshot || snapshot.revision >= this.snapshot.revision) this.snapshot = snapshot;
    this.connected = true;
    this.error = '';
  }

  async connect(code = '', restoreSession = null) {
    const previous = this.session;
    this.disconnect();
    const generation = this.generation;
    this.session = restoreSession || { code, token: previous?.code === code && code ? previous.token : crypto.randomUUID() };
    this.busy = true;
    this.onChange();
    try {
      const snapshot = restoreSession
        ? await this.request(`/${code}`)
        : await this.request(code ? `/${code}/join` : '', 'POST', { token: this.session.token });
      if (generation !== this.generation) return;
      this.session.code = snapshot.code;
      this.accept(snapshot);
    } catch (error) {
      if (generation !== this.generation) return;
      this.error = error.status ? error.message : '暫時連不上，請檢查網路後再試一次。';
      if ([401, 403, 404, 409, 410].includes(error.status)) this.session = null;
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        this.onChange();
        if (this.session?.code) this.schedule();
      }
    }
  }

  schedule() {
    clearTimeout(this.timer);
    if (this.session?.code && !this.snapshot?.closed) this.timer = setTimeout(() => this.poll(), this.connected ? 1000 : 2500);
  }

  async poll() {
    if (!this.session?.code) return;
    const generation = this.generation;
    try {
      const snapshot = await this.request(`/${this.session.code}`);
      if (generation !== this.generation) return;
      this.accept(snapshot);
    } catch (error) {
      if (generation !== this.generation) return;
      this.connected = false;
      this.error = error.status ? error.message : '連線中斷，正在重新連線…';
      if ([401, 403, 404, 410].includes(error.status)) this.session = null;
    } finally {
      if (generation === this.generation) { this.onChange(); this.schedule(); }
    }
  }

  async act(operation, action = {}) {
    if (!this.session || !this.snapshot || this.busy || !this.connected) return;
    const generation = this.generation;
    this.busy = true;
    this.error = '';
    this.onChange();
    try {
      const snapshot = await this.request(`/${this.session.code}/${operation}`, 'POST', { ...action, revision: this.snapshot.revision });
      if (generation !== this.generation) return;
      this.accept(snapshot);
    } catch (error) {
      if (generation !== this.generation) return;
      this.error = error.status ? error.message : '操作尚未確認，正在重新同步棋局…';
      this.connected = false;
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        this.onChange();
        if (!this.connected) await this.poll();
        else this.schedule();
      }
    }
  }

  async leave() {
    const session = this.session;
    this.disconnect();
    if (session?.code) {
      try { await this.request(`/${session.code}/leave`, 'POST', {}, session); }
      catch { /* A closed tab or lost connection is still shown as offline to the opponent. */ }
    }
  }

  disconnect() {
    this.generation++;
    clearTimeout(this.timer);
    this.timer = null;
    this.session = null;
    this.snapshot = null;
    this.connected = false;
    this.busy = false;
    this.error = '';
  }
}
