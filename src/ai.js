import { SIZE, canStep, legalMoves, movePawn, placeWall } from './game.js';

function distanceToGoal(game, player) {
  const goal = player === 0 ? 0 : SIZE - 1;
  const queue = [{ ...game.pawns[player], distance: 0 }];
  const seen = new Set([queue[0].r * SIZE + queue[0].c]);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (cell.r === goal) return cell.distance;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const next = { r: cell.r + dr, c: cell.c + dc, distance: cell.distance + 1 };
      const key = next.r * SIZE + next.c;
      if (!seen.has(key) && canStep(cell, next, game.walls)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  return Infinity;
}

export function chooseComputerAction(game) {
  if (game.winner !== null) return null;
  const player = game.turn;
  const opponent = 1 - player;
  const opponentGoal = opponent === 0 ? 0 : SIZE - 1;
  let best = null;
  let bestScore = -Infinity;

  function consider(action, result) {
    if (!result.ok) return;
    const next = result.state;
    const opponentCanWin = legalMoves(next, opponent).some((cell) => cell.r === opponentGoal);
    // Compare race lengths, conserve walls on ties, and prevent an immediate loss.
    const score = distanceToGoal(next, opponent) - distanceToGoal(next, player)
      + (next.remaining[player] - next.remaining[opponent]) * 0.15
      - (opponentCanWin ? 1000 : 0);
    if (score > bestScore) { bestScore = score; best = action; }
  }

  for (const to of legalMoves(game)) {
    const result = movePawn(game, to);
    if (result.state.winner === player) return { type: 'move', to };
    consider({ type: 'move', to }, result);
  }
  if (game.remaining[player] > 0) {
    for (let r = 0; r < SIZE - 1; r++) for (let c = 0; c < SIZE - 1; c++) for (const o of ['h', 'v']) {
      const wall = { r, c, o };
      consider({ type: 'wall', wall }, placeWall(game, wall));
    }
  }
  return best;
}
