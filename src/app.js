import { createGame, legalMoves, validateWall, movePawn, placeWall } from './game.js';
import { chooseComputerAction } from './ai.js';
import { RoomClient, PLAY_URL } from './network.js';

const $ = (id) => document.getElementById(id);
const names = ['藍方', '粉紅方'];
const colors = ['blue', 'pink'];
let game = createGame();
let history = [];
let mode = 'move';
let orientation = 'h';
let selected = null;
let wallFocus = { r: 3, c: 3 };
let matchMode = 'solo';
let restartMode = matchMode;
let computerTimer = null;
let onlineRevision = -1;
let onlineRound = 0;
let exitMode = 'solo';
const room = new RoomClient(onRoomChange);
const cells = [];
const targets = [];

function canHumanPlay() {
  if (game.winner !== null || isComputerTurn()) return false;
  if (matchMode !== 'online') return true;
  return room.connected && !room.busy && room.snapshot?.ready && !room.snapshot.closed && room.snapshot.player === game.turn;
}

function rememberRoom() {
  try {
    if (room.session?.code) sessionStorage.setItem('quoridor-room', JSON.stringify(room.session));
    else sessionStorage.removeItem('quoridor-room');
  } catch { /* Play still works when browser storage is unavailable. */ }
}

function onRoomChange() {
  rememberRoom();
  if (matchMode !== 'online') return;
  const snapshot = room.snapshot;
  let justWon = false;
  if (snapshot && (snapshot.revision !== onlineRevision || snapshot.round !== onlineRound)) {
    justWon = snapshot.game.winner !== null && (game.winner === null || onlineRound !== snapshot.round);
    if (snapshot.round !== onlineRound || snapshot.closed) $('winner-dialog').close();
    game = snapshot.game;
    onlineRevision = snapshot.revision;
    onlineRound = snapshot.round;
    history = [];
    selected = null;
    mode = 'move';
  }
  render();
  if (justWon && !snapshot.closed && !document.querySelector('dialog[open]')) showWinner();
}

function onlineMessage() {
  if (room.error) return room.error;
  const snapshot = room.snapshot;
  if (!snapshot) return room.busy ? '正在連線…' : '建立房間，把邀請連結傳給朋友。';
  if (snapshot.closed) return '房間已關閉。離開後可建立新房間。';
  if (!room.connected) return '正在重新同步棋局，請稍候。';
  if (!snapshot.ready) return '等待朋友加入，你是藍方先手。';
  if (snapshot.rematchRequested[snapshot.player]) return '已邀請重新開局，等待朋友同意。';
  if (snapshot.rematchRequested[1 - snapshot.player]) return '朋友邀請重新開局，按「同意重新開局」接受。';
  if (!snapshot.opponentOnline) return '朋友暫時離線；棋局已保留，等待重新連線。';
  return room.busy ? '正在確認你的操作…' : `你是${names[snapshot.player]}。${game.turn === snapshot.player ? '輪到你出手。' : '等待朋友出手。'}`;
}

function submitAction(type, value) {
  if (!canHumanPlay()) return;
  const result = type === 'move' ? movePawn(game, value) : placeWall(game, value);
  if (!result.ok) { announce(result.reason, true); return; }
  if (matchMode === 'online') room.act('actions', type === 'move' ? { type, to: value } : { type, wall: value });
  else commit(result.state);
}

function isComputerTurn() {
  return matchMode === 'solo' && game.turn === 1 && game.winner === null;
}

function stopComputerTurn() {
  clearTimeout(computerTimer);
  computerTimer = null;
}

function scheduleComputerTurn() {
  stopComputerTurn();
  if (!isComputerTurn() || document.querySelector('dialog[open]')) return;
  computerTimer = setTimeout(() => {
    computerTimer = null;
    if (!isComputerTurn()) return;
    const action = chooseComputerAction(game);
    const result = action.type === 'move' ? movePawn(game, action.to) : placeWall(game, action.wall);
    if (result.ok) commit(result.state);
  }, 450);
}

function openDialog(id) {
  stopComputerTurn();
  $(id).showModal();
}

function wallPosition(element, wall) {
  const horizontal = wall.o === 'h';
  Object.assign(element.style, {
    left: `${(wall.c * 6 + (horizontal ? 0 : 5)) / 53 * 100}%`,
    top: `${(wall.r * 6 + (horizontal ? 5 : 0)) / 53 * 100}%`,
    width: `${(horizontal ? 11 : 1) / 53 * 100}%`,
    height: `${(horizontal ? 1 : 11) / 53 * 100}%`,
  });
}

function announce(text, error = false) {
  $('instruction-text').textContent = text;
  $('instruction').classList.toggle('error', error);
}

function previewWall(wall) {
  $('ghost').hidden = !wall;
  if (!wall) return;
  const result = validateWall(game, wall);
  $('ghost').className = `wall ghost ${wall.o}${result.ok ? '' : ' invalid'}`;
  wallPosition($('ghost'), wall);
}

function updateSelection() {
  const result = selected ? validateWall(game, selected) : null;
  $('confirm-wall').disabled = !result?.ok || !canHumanPlay();
  $('place-wall-now').disabled = $('confirm-wall').disabled;
  $('wall-place-status').textContent = selected ? (result.ok ? '位置已選好' : '這裡不能放牆') : '先點棋盤縫隙';
  $('confirm-wall').textContent = selected ? (result.ok ? '確認放置 →' : '這裡不能放牆') : '先選擇放牆位置';
  if (selected) announce(result.ok ? '位置選好了。按「確認放置」完成這一回合。' : result.reason, !result.ok);
  else if (mode === 'wall') announce('點選棋盤縫隙預覽牆壁，再確認放置。');
  previewWall(selected);
}

function selectWall(r, c) {
  if (mode !== 'wall' || !canHumanPlay()) return;
  selected = { r, c, o: orientation };
  wallFocus = { r, c };
  targets.forEach((button) => { button.tabIndex = Number(button.dataset.r) === r && Number(button.dataset.c) === c ? 0 : -1; });
  updateSelection();
}

for (let r = 0; r < 9; r++) {
  for (let c = 0; c < 9; c++) {
    const button = document.createElement('button');
    button.className = 'tile';
    button.type = 'button';
    button.dataset.r = r;
    button.dataset.c = c;
    button.addEventListener('click', () => {
      if (mode === 'move') submitAction('move', { r, c });
    });
    $('tiles').append(button);
    cells.push(button);
  }
}
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    const button = document.createElement('button');
    button.className = 'wall-target';
    button.type = 'button';
    button.dataset.r = r;
    button.dataset.c = c;
    Object.assign(button.style, { left: `${(c * 6 + 2.5) / 53 * 100}%`, top: `${(r * 6 + 2.5) / 53 * 100}%`, width: `${6 / 53 * 100}%`, height: `${6 / 53 * 100}%` });
    button.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') previewWall({ r, c, o: orientation }); });
    button.addEventListener('pointerleave', () => previewWall(selected));
    button.addEventListener('click', () => selectWall(r, c));
    button.addEventListener('keydown', (event) => {
      const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
      if (!delta) return;
      event.preventDefault();
      const nr = Math.max(0, Math.min(7, r + delta[0]));
      const nc = Math.max(0, Math.min(7, c + delta[1]));
      selectWall(nr, nc);
      targets[nr * 8 + nc].focus();
    });
    $('wall-targets').append(button);
    targets.push(button);
  }
}

function render() {
  const finished = game.winner !== null;
  const thinking = isComputerTurn();
  const solo = matchMode === 'solo';
  const online = matchMode === 'online';
  const canPlay = canHumanPlay();
  const snapshot = room.snapshot;
  $('match-label').textContent = online ? '好友線上對弈' : solo ? '單人對電腦' : '同機雙人';
  $('match-solo').setAttribute('aria-pressed', String(solo));
  $('match-local').setAttribute('aria-pressed', String(matchMode === 'local'));
  $('match-online').setAttribute('aria-pressed', String(online));
  $('online-panel').hidden = !online;
  $('room-lobby').hidden = Boolean(snapshot);
  $('room-active').hidden = !snapshot;
  $('create-room').disabled = room.busy;
  $('join-room').disabled = room.busy;
  $('room-message').textContent = onlineMessage();
  if (snapshot) {
    $('room-code').textContent = snapshot.code;
    $('invite-link').value = `${PLAY_URL}?room=${snapshot.code}`;
    $('room-seat').textContent = `你是${names[snapshot.player]} · 第 ${snapshot.round} 局`;
  }
  $('rules-intro').textContent = online ? '建立房間或輸入朋友的六碼房號。藍方先手，雙方輪流操作；重新開局需要彼此同意。' : solo ? '你操作藍方先手，電腦操作粉紅方。完全離線也能對戰。' : '兩人共用一個畫面，藍方先手，輪流行動。';
  $('undo-label').textContent = online ? '線上不提供悔棋' : solo ? '悔一回合' : '悔一步';
  $('restart-label').textContent = online ? (snapshot?.rematchRequested[snapshot.player] ? '已邀請重新開局' : snapshot?.rematchRequested[1 - snapshot.player] ? '同意重新開局' : '邀請重新開局') : '重新開始';
  $('restart').disabled = online && (!snapshot?.ready || snapshot.closed || room.busy || !room.connected || snapshot.rematchRequested[snapshot.player]);
  $('turn-eyebrow').textContent = online ? 'ONLINE DUEL' : thinking ? 'COMPUTER TURN' : 'YOUR TURN';
  $('board').setAttribute('aria-busy', String(thinking || (online && room.busy)));
  document.documentElement.style.setProperty('--accent', `var(--${colors[game.turn]})`);
  document.documentElement.style.setProperty('--accent-rgb', game.turn === 0 ? '121,214,236' : '242,164,184');
  const moves = legalMoves(game);
  cells.forEach((button, index) => {
    const r = Math.floor(index / 9), c = index % 9;
    const occupant = game.pawns.findIndex((p) => p.r === r && p.c === c);
    const legal = canPlay && mode === 'move' && moves.some((p) => p.r === r && p.c === c);
    button.className = `tile${legal ? ' legal' : ''}${occupant === game.turn && !finished ? ' current' : ''}`;
    button.tabIndex = legal ? 0 : -1;
    button.disabled = !canPlay;
    button.setAttribute('aria-label', `${String.fromCharCode(65 + c)}${r + 1}${occupant >= 0 ? `，${names[occupant]}棋子` : ''}${legal ? '，可以移動到這裡' : ''}`);
    button.replaceChildren();
    if (occupant >= 0) {
      const pawn = document.createElement('span');
      pawn.className = `pawn ${colors[occupant]}`;
      pawn.setAttribute('aria-hidden', 'true');
      button.append(pawn);
    }
  });
  $('walls').replaceChildren();
  game.walls.forEach((wall) => {
    const element = document.createElement('span');
    element.className = `wall ${wall.o} ${colors[wall.owner]}`;
    wallPosition(element, wall);
    $('walls').append(element);
  });
  [0, 1].forEach((player) => {
    const rail = $(`player-${player}`);
    rail.querySelector('.player-name strong').textContent = online && snapshot ? `${snapshot.player === player ? '你' : '朋友'} · ${names[player]}` : solo ? `${player === 0 ? '你' : '電腦'} · ${names[player]}` : names[player];
    rail.classList.toggle('active', game.turn === player);
    rail.querySelector('.wall-count').innerHTML = `<b>${game.remaining[player]}</b> / 10`;
    const sticks = rail.querySelector('.wall-sticks');
    sticks.replaceChildren();
    for (let i = 0; i < 10; i++) {
      const stick = document.createElement('i');
      stick.className = i >= game.remaining[player] ? 'used' : '';
      sticks.append(stick);
    }
    rail.setAttribute('aria-label', `${names[player]}，剩餘 ${game.remaining[player]} 道牆${game.turn === player ? '，目前回合' : ''}`);
  });
  $('move-number').textContent = finished ? `共 ${game.ply} 手` : `第 ${String(game.ply + 1).padStart(3, '0')} 手`;
  $('turn-title').textContent = finished ? winnerTitle() : online ? (snapshot?.closed ? '房間已結束' : !snapshot?.ready ? '等待朋友加入' : !room.connected ? '正在重新連線…' : room.busy ? '正在送出操作…' : canPlay ? '輪到你了' : '等待朋友出手') : (solo ? (thinking ? '電腦思考中…' : '輪到你了') : `${names[game.turn]}的回合`);
  $('turn-caption').textContent = online ? (snapshot ? `你是${names[snapshot.player]}，棋局會自動同步。` : '不同裝置，也能坐在同一張棋盤前。') : finished ? '對局結束，再來挑戰一局。' : (solo ? (thinking ? '正在選擇路線與放牆位置。' : '你是藍方，粉紅方由電腦自動操作。') : '往前一步，或讓對手多繞一步。');
  $('mode-move').disabled = !canPlay;
  $('mode-wall').disabled = !canPlay || game.remaining[game.turn] === 0;
  for (const action of ['move', 'wall']) {
    $(`mode-${action}`).classList.toggle('active', mode === action);
    $(`mode-${action}`).setAttribute('aria-pressed', String(mode === action));
  }
  $('wall-controls').hidden = mode !== 'wall' || !canPlay;
  $('wall-targets').hidden = mode !== 'wall' || !canPlay;
  $('wall-placement-bar').hidden = mode !== 'wall' || !canPlay;
  document.body.classList.toggle('wall-placement-active', !$('wall-placement-bar').hidden);
  $('board').classList.toggle('wall-mode', mode === 'wall');
  $('horizontal').setAttribute('aria-pressed', String(orientation === 'h'));
  $('vertical').setAttribute('aria-pressed', String(orientation === 'v'));
  targets.forEach((button) => {
    const r = Number(button.dataset.r), c = Number(button.dataset.c);
    button.tabIndex = r === wallFocus.r && c === wallFocus.c ? 0 : -1;
    button.setAttribute('aria-label', `在 ${String.fromCharCode(65 + c)}${r + 1} ${orientation === 'h' ? '下方放橫牆' : '右方放直牆'}，預覽位置`);
  });
  $('undo').disabled = online || history.length === 0;
  updateSelection();
  if (mode === 'move') announce(online ? onlineMessage() : finished ? '對局結束。可以重新開始，或悔棋檢視其他走法。' : (thinking ? '電腦會自動行動，稍等一下就輪到你。' : `${solo ? '輪到你了' : names[game.turn]}，點選棋盤上的亮點移動。${game.remaining[game.turn] === 0 ? '你的牆已用完。' : ''}`));
}

function winnerTitle() {
  if (matchMode === 'online') return game.winner === room.snapshot?.player ? '你獲勝了！' : '朋友獲勝！';
  return matchMode === 'solo' ? (game.winner === 0 ? '你獲勝了！' : '電腦獲勝！') : `${names[game.winner]}獲勝！`;
}

function showWinner() {
  $('winner-title').textContent = winnerTitle();
  $('winner-detail').textContent = `經過 ${game.ply} 手較量，${names[game.winner]}率先抵達對面底線。${matchMode === 'online' ? '邀請朋友再來一局？' : '換個策略，再挑戰一次？'}`;
  $('play-again').textContent = matchMode === 'online' ? '邀請再來一局' : '再來一局';
  openDialog('winner-dialog');
}

function commit(next) {
  history.push(game);
  game = next;
  mode = 'move';
  selected = null;
  render();
  if (game.winner !== null) {
    showWinner();
  } else {
    scheduleComputerTurn();
  }
}

function setMode(next) {
  if (!canHumanPlay() || (next === 'wall' && game.remaining[game.turn] === 0)) return;
  mode = next;
  selected = null;
  render();
}

function rotate(next) {
  if (!canHumanPlay()) return;
  orientation = next;
  if (selected) selected = { ...selected, o: next };
  render();
}

function restart(nextMatchMode = matchMode) {
  stopComputerTurn();
  matchMode = nextMatchMode;
  onlineRevision = -1;
  onlineRound = 0;
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  game = createGame();
  history = [];
  mode = 'move';
  orientation = 'h';
  selected = null;
  wallFocus = { r: 3, c: 3 };
  render();
}

function requestNewGame(nextMatchMode = matchMode) {
  if (matchMode === 'online' && nextMatchMode === 'online') { room.act('rematch'); return; }
  if (matchMode === 'online' && room.session) { exitMode = nextMatchMode; openDialog('leave-dialog'); return; }
  if (game.ply === 0) { restart(nextMatchMode); return; }
  restartMode = nextMatchMode;
  $('restart-title').textContent = nextMatchMode === matchMode ? '重新開始這一局？' : `切換到${nextMatchMode === 'online' ? '好友線上對弈' : nextMatchMode === 'solo' ? '單人對電腦' : '同機雙人'}？`;
  openDialog('restart-dialog');
}

$('mode-move').addEventListener('click', () => setMode('move'));
$('mode-wall').addEventListener('click', () => setMode('wall'));
$('horizontal').addEventListener('click', () => rotate('h'));
$('vertical').addEventListener('click', () => rotate('v'));
['confirm-wall', 'place-wall-now'].forEach((id) => $(id).addEventListener('click', () => { if (selected) submitAction('wall', selected); }));
$('rotate-wall-now').addEventListener('click', () => rotate(orientation === 'h' ? 'v' : 'h'));
$('undo').addEventListener('click', () => {
  if (!history.length || matchMode === 'online') return;
  stopComputerTurn();
  do { game = history.pop(); } while (matchMode === 'solo' && game.turn === 1 && history.length);
  mode = 'move';
  selected = null;
  render();
});
$('restart').addEventListener('click', () => requestNewGame());
$('match-solo').addEventListener('click', () => { if (matchMode !== 'solo') requestNewGame('solo'); });
$('match-local').addEventListener('click', () => { if (matchMode !== 'local') requestNewGame('local'); });
$('match-online').addEventListener('click', () => { if (matchMode !== 'online') requestNewGame('online'); });
$('confirm-restart').addEventListener('click', () => restart(restartMode));
$('play-again').addEventListener('click', () => {
  if (matchMode === 'online') { $('winner-dialog').close(); room.act('rematch'); }
  else restart();
});
$('create-room').addEventListener('click', () => room.connect());
$('join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = $('join-code').value.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) { $('room-message').textContent = '請輸入朋友提供的六碼房號。'; return; }
  room.connect(code);
});
$('copy-room').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('invite-link').value); $('room-message').textContent = '邀請連結已複製，傳給朋友就能加入。'; }
  catch { $('invite-link').focus(); $('invite-link').select(); $('room-message').textContent = '請複製上方已選取的邀請連結。'; }
});
$('leave-room').addEventListener('click', () => { exitMode = 'online'; openDialog('leave-dialog'); });
$('confirm-leave').addEventListener('click', () => {
  room.leave();
  rememberRoom();
  restart(exitMode);
});
['help', 'footer-help'].forEach((id) => $(id).addEventListener('click', () => openDialog('rules-dialog')));
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('close', scheduleComputerTurn));
document.querySelectorAll('.close-dialog').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey || mode !== 'wall') return;
  if (event.key.toLowerCase() === 'r') { event.preventDefault(); rotate(orientation === 'h' ? 'v' : 'h'); }
  if (event.key === 'Escape') { selected = null; updateSelection(); }
});
render();
try {
  const saved = JSON.parse(sessionStorage.getItem('quoridor-room') || 'null');
  const invited = new URL(location.href).searchParams.get('room')?.toUpperCase();
  if (saved?.code && saved?.token && (!invited || invited === saved.code)) {
    restart('online');
    room.connect(saved.code, saved);
  } else if (invited && /^[A-HJ-NP-Z2-9]{6}$/.test(invited)) {
    restart('online');
    $('join-code').value = invited;
    $('room-message').textContent = '朋友邀請你對弈，按「加入」開始。';
  }
} catch { /* A fresh game remains available if storage or the invite is invalid. */ }
