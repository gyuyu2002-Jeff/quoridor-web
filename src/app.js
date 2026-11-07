import { createGame, legalMoves, validateWall, movePawn, placeWall } from './game.js';

const $ = (id) => document.getElementById(id);
const names = ['藍方', '粉紅方'];
const colors = ['blue', 'pink'];
let game = createGame();
let history = [];
let mode = 'move';
let orientation = 'h';
let selected = null;
let wallFocus = { r: 3, c: 3 };
const cells = [];
const targets = [];

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
  $('confirm-wall').disabled = !result?.ok;
  $('confirm-wall').textContent = selected ? (result.ok ? '確認放置 →' : '這裡不能放牆') : '先選擇放牆位置';
  if (selected) announce(result.ok ? '位置選好了。按「確認放置」完成這一回合。' : result.reason, !result.ok);
  else if (mode === 'wall') announce('點選棋盤縫隙預覽牆壁，再確認放置。');
  previewWall(selected);
}

function selectWall(r, c) {
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
      if (mode !== 'move' || game.winner !== null) return;
      const result = movePawn(game, { r, c });
      if (result.ok) commit(result.state);
      else announce(result.reason, true);
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
  document.documentElement.style.setProperty('--accent', `var(--${colors[game.turn]})`);
  document.documentElement.style.setProperty('--accent-rgb', game.turn === 0 ? '121,214,236' : '242,164,184');
  const moves = legalMoves(game);
  cells.forEach((button, index) => {
    const r = Math.floor(index / 9), c = index % 9;
    const occupant = game.pawns.findIndex((p) => p.r === r && p.c === c);
    const legal = mode === 'move' && moves.some((p) => p.r === r && p.c === c);
    button.className = `tile${legal ? ' legal' : ''}${occupant === game.turn && !finished ? ' current' : ''}`;
    button.tabIndex = legal ? 0 : -1;
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
  $('turn-title').textContent = finished ? `${names[game.winner]}獲勝！` : `${names[game.turn]}的回合`;
  $('turn-caption').textContent = finished ? '走到彼岸，這局由你拿下。' : '往前一步，或讓對手多繞一步。';
  $('mode-move').disabled = finished;
  $('mode-wall').disabled = finished || game.remaining[game.turn] === 0;
  for (const action of ['move', 'wall']) {
    $(`mode-${action}`).classList.toggle('active', mode === action);
    $(`mode-${action}`).setAttribute('aria-pressed', String(mode === action));
  }
  $('wall-controls').hidden = mode !== 'wall' || finished;
  $('wall-targets').hidden = mode !== 'wall' || finished;
  $('board').classList.toggle('wall-mode', mode === 'wall');
  $('horizontal').setAttribute('aria-pressed', String(orientation === 'h'));
  $('vertical').setAttribute('aria-pressed', String(orientation === 'v'));
  targets.forEach((button) => {
    const r = Number(button.dataset.r), c = Number(button.dataset.c);
    button.tabIndex = r === wallFocus.r && c === wallFocus.c ? 0 : -1;
    button.setAttribute('aria-label', `在 ${String.fromCharCode(65 + c)}${r + 1} ${orientation === 'h' ? '下方放橫牆' : '右方放直牆'}，預覽位置`);
  });
  $('undo').disabled = history.length === 0;
  updateSelection();
  if (mode === 'move') announce(finished ? '對局結束。可以重新開始，或悔一步檢視其他走法。' : `${names[game.turn]}，點選棋盤上的亮點移動。${game.remaining[game.turn] === 0 ? '你的牆已用完。' : ''}`);
}

function commit(next) {
  history.push(game);
  game = next;
  mode = 'move';
  selected = null;
  render();
  if (game.winner !== null) {
    $('winner-title').textContent = `${names[game.winner]}獲勝！`;
    $('winner-detail').textContent = `經過 ${game.ply} 手較量，${names[game.winner]}率先抵達對面底線。換個策略，再挑戰一次？`;
    $('winner-dialog').showModal();
  }
}

function setMode(next) {
  if (game.winner !== null || (next === 'wall' && game.remaining[game.turn] === 0)) return;
  mode = next;
  selected = null;
  render();
}

function rotate(next) {
  orientation = next;
  if (selected) selected = { ...selected, o: next };
  render();
}

function restart() {
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  game = createGame();
  history = [];
  mode = 'move';
  orientation = 'h';
  selected = null;
  wallFocus = { r: 3, c: 3 };
  render();
}

$('mode-move').addEventListener('click', () => setMode('move'));
$('mode-wall').addEventListener('click', () => setMode('wall'));
$('horizontal').addEventListener('click', () => rotate('h'));
$('vertical').addEventListener('click', () => rotate('v'));
$('confirm-wall').addEventListener('click', () => {
  if (!selected) return;
  const result = placeWall(game, selected);
  if (result.ok) commit(result.state);
  else announce(result.reason, true);
});
$('undo').addEventListener('click', () => {
  if (!history.length) return;
  game = history.pop();
  mode = 'move';
  selected = null;
  render();
});
$('restart').addEventListener('click', () => { if (game.ply) $('restart-dialog').showModal(); else restart(); });
$('confirm-restart').addEventListener('click', restart);
$('play-again').addEventListener('click', restart);
['help', 'footer-help'].forEach((id) => $(id).addEventListener('click', () => $('rules-dialog').showModal()));
document.querySelectorAll('.close-dialog').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey || mode !== 'wall') return;
  if (event.key.toLowerCase() === 'r') { event.preventDefault(); rotate(orientation === 'h' ? 'v' : 'h'); }
  if (event.key === 'Escape') { selected = null; updateSelection(); }
});
render();
