export const SIZE = 9;
const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const same = (a, b) => a.r === b.r && a.c === b.c;
const inside = ({ r, c }) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < SIZE && c >= 0 && c < SIZE;

export function createGame() {
  return { pawns: [{ r: 8, c: 4 }, { r: 0, c: 4 }], walls: [], remaining: [10, 10], turn: 0, winner: null, ply: 0 };
}

export function canStep(a, b, walls) {
  if (!inside(a) || !inside(b) || Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return false;
  return !walls.some((w) => a.r !== b.r
    ? w.o === 'h' && w.r === Math.min(a.r, b.r) && (a.c === w.c || a.c === w.c + 1)
    : w.o === 'v' && w.c === Math.min(a.c, b.c) && (a.r === w.r || a.r === w.r + 1));
}

export function legalMoves(game, player = game.turn) {
  if (game.winner !== null) return [];
  const pawn = game.pawns[player];
  const other = game.pawns[1 - player];
  const moves = [];
  for (const [dr, dc] of directions) {
    const next = { r: pawn.r + dr, c: pawn.c + dc };
    if (!canStep(pawn, next, game.walls)) continue;
    if (!same(next, other)) {
      moves.push(next);
      continue;
    }
    const jump = { r: other.r + dr, c: other.c + dc };
    if (canStep(other, jump, game.walls)) {
      moves.push(jump);
    } else {
      // A diagonal is allowed only when a wall or board edge prevents a straight jump.
      for (const [sr, sc] of [[dc, dr], [-dc, -dr]]) {
        const side = { r: other.r + sr, c: other.c + sc };
        if (canStep(other, side, game.walls)) moves.push(side);
      }
    }
  }
  return moves;
}

export function hasPath(game, player, walls = game.walls) {
  const goal = player === 0 ? 0 : SIZE - 1;
  const queue = [game.pawns[player]];
  const seen = new Set([queue[0].r * SIZE + queue[0].c]);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (cell.r === goal) return true;
    for (const [dr, dc] of directions) {
      const next = { r: cell.r + dr, c: cell.c + dc };
      const key = next.r * SIZE + next.c;
      if (!seen.has(key) && canStep(cell, next, walls)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  return false;
}

export function validateWall(game, wall) {
  if (game.winner !== null) return { ok: false, reason: '這局已經結束，開新局再挑戰吧。' };
  if (game.remaining[game.turn] === 0) return { ok: false, reason: '牆已用完，請移動棋子。' };
  if (!['h', 'v'].includes(wall.o) || !Number.isInteger(wall.r) || !Number.isInteger(wall.c) || wall.r < 0 || wall.r >= SIZE - 1 || wall.c < 0 || wall.c >= SIZE - 1) {
    return { ok: false, reason: '牆必須放在棋盤內的縫隙。' };
  }
  const overlaps = game.walls.some((w) => w.o === wall.o
    ? (w.o === 'h' ? w.r === wall.r && Math.abs(w.c - wall.c) < 2 : w.c === wall.c && Math.abs(w.r - wall.r) < 2)
    : w.r === wall.r && w.c === wall.c);
  if (overlaps) return { ok: false, reason: '牆不能重疊或交叉，換個位置試試。' };
  const walls = [...game.walls, wall];
  if (![0, 1].every((player) => hasPath(game, player, walls))) return { ok: false, reason: '這裡會封死道路，雙方都要留有通路。' };
  return { ok: true };
}

export function movePawn(game, target) {
  if (!legalMoves(game).some((cell) => same(cell, target))) return { ok: false, reason: '請選擇亮點標示的可走位置。' };
  const pawns = game.pawns.map((p, i) => i === game.turn ? { ...target } : p);
  const winner = target.r === (game.turn === 0 ? 0 : SIZE - 1) ? game.turn : null;
  return { ok: true, state: { ...game, pawns, winner, turn: winner === null ? 1 - game.turn : game.turn, ply: game.ply + 1 } };
}

export function placeWall(game, wall) {
  const result = validateWall(game, wall);
  if (!result.ok) return result;
  const remaining = game.remaining.map((count, i) => count - (i === game.turn ? 1 : 0));
  return { ok: true, state: { ...game, walls: [...game.walls, { ...wall, owner: game.turn }], remaining, turn: 1 - game.turn, ply: game.ply + 1 } };
}
