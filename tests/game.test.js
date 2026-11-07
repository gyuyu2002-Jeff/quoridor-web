import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, canStep, legalMoves, hasPath, validateWall, movePawn, placeWall } from '../src/game.js';

const includes = (moves, r, c) => moves.some((p) => p.r === r && p.c === c);
const fixture = (pawns, walls = []) => ({ ...createGame(), pawns, walls });

test('starts at opposite centers, with ten walls and blue first', () => {
  const game = createGame();
  assert.deepEqual(game.pawns, [{ r: 8, c: 4 }, { r: 0, c: 4 }]);
  assert.deepEqual(game.remaining, [10, 10]);
  assert.equal(game.turn, 0);
  assert.equal(legalMoves(game).length, 3);
});

test('a legal move changes one pawn and advances the turn without mutating its predecessor', () => {
  const game = createGame();
  const result = movePawn(game, { r: 7, c: 4 });
  assert.equal(result.ok, true);
  assert.equal(result.state.turn, 1);
  assert.equal(result.state.ply, 1);
  assert.deepEqual(result.state.pawns[0], { r: 7, c: 4 });
  assert.deepEqual(game.pawns[0], { r: 8, c: 4 });
  assert.deepEqual(result.state.remaining, [10, 10]);
});

test('rejects arbitrary diagonal moves, teleporting and off-board positions', () => {
  for (const cell of [{ r: 7, c: 3 }, { r: 2, c: 4 }, { r: 9, c: 4 }, { r: 7.5, c: 4 }]) {
    assert.equal(movePawn(createGame(), cell).ok, false);
  }
});

test('each horizontal wall blocks both covered edges in both directions', () => {
  const walls = [{ r: 3, c: 4, o: 'h' }];
  for (const c of [4, 5]) {
    assert.equal(canStep({ r: 3, c }, { r: 4, c }, walls), false);
    assert.equal(canStep({ r: 4, c }, { r: 3, c }, walls), false);
  }
  assert.equal(canStep({ r: 3, c: 6 }, { r: 4, c: 6 }, walls), true);
});

test('each vertical wall blocks both covered edges in both directions', () => {
  const walls = [{ r: 3, c: 4, o: 'v' }];
  for (const r of [3, 4]) {
    assert.equal(canStep({ r, c: 4 }, { r, c: 5 }, walls), false);
    assert.equal(canStep({ r, c: 5 }, { r, c: 4 }, walls), false);
  }
  assert.equal(canStep({ r: 5, c: 4 }, { r: 5, c: 5 }, walls), true);
});

test('jumps over an adjacent opponent without allowing an optional diagonal', () => {
  const moves = legalMoves(fixture([{ r: 4, c: 4 }, { r: 3, c: 4 }]));
  assert.equal(includes(moves, 2, 4), true);
  assert.equal(includes(moves, 3, 4), false);
  assert.equal(includes(moves, 3, 3), false);
  assert.equal(includes(moves, 3, 5), false);
});

test('a wall behind the opponent enables both unblocked side moves', () => {
  const moves = legalMoves(fixture([{ r: 4, c: 4 }, { r: 3, c: 4 }], [{ r: 2, c: 4, o: 'h' }]));
  assert.equal(includes(moves, 2, 4), false);
  assert.equal(includes(moves, 3, 3), true);
  assert.equal(includes(moves, 3, 5), true);
});

test('diagonal jumps respect side walls', () => {
  const moves = legalMoves(fixture([{ r: 4, c: 4 }, { r: 3, c: 4 }], [{ r: 2, c: 4, o: 'h' }, { r: 3, c: 3, o: 'v' }]));
  assert.equal(includes(moves, 3, 3), false);
  assert.equal(includes(moves, 3, 5), true);
});

test('the board edge also enables diagonal jumping', () => {
  const moves = legalMoves(fixture([{ r: 1, c: 4 }, { r: 0, c: 4 }]));
  assert.equal(includes(moves, 0, 3), true);
  assert.equal(includes(moves, 0, 5), true);
});

test('horizontal encounters use the same straight and diagonal rules', () => {
  const pawns = [{ r: 4, c: 4 }, { r: 4, c: 5 }];
  assert.equal(includes(legalMoves(fixture(pawns)), 4, 6), true);
  const moves = legalMoves(fixture(pawns, [{ r: 3, c: 5, o: 'v' }]));
  assert.equal(includes(moves, 4, 6), false);
  assert.equal(includes(moves, 3, 5), true);
  assert.equal(includes(moves, 5, 5), true);
});

test('a wall between pawns prevents jumping altogether', () => {
  const moves = legalMoves(fixture([{ r: 4, c: 4 }, { r: 3, c: 4 }], [{ r: 3, c: 4, o: 'h' }]));
  assert.equal(includes(moves, 2, 4), false);
  assert.equal(includes(moves, 3, 3), false);
  assert.equal(includes(moves, 3, 5), false);
});

test('placing a wall consumes one wall, advances turn, and preserves the previous state', () => {
  const game = createGame();
  const result = placeWall(game, { r: 3, c: 3, o: 'h' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.remaining, [9, 10]);
  assert.equal(result.state.turn, 1);
  assert.equal(result.state.walls[0].owner, 0);
  assert.equal(game.walls.length, 0);
});

test('rejects duplicate, partial overlap and central crossing walls', () => {
  const game = { ...createGame(), walls: [{ r: 3, c: 3, o: 'h' }] };
  for (const wall of [{ r: 3, c: 3, o: 'h' }, { r: 3, c: 2, o: 'h' }, { r: 3, c: 4, o: 'h' }, { r: 3, c: 3, o: 'v' }]) {
    assert.match(validateWall(game, wall).reason, /重疊或交叉/);
  }
  const vertical = { ...createGame(), walls: [{ r: 3, c: 3, o: 'v' }] };
  assert.equal(validateWall(vertical, { r: 4, c: 3, o: 'v' }).ok, false);
});

test('allows legal end-to-end and T connections', () => {
  const game = { ...createGame(), walls: [{ r: 3, c: 3, o: 'h' }] };
  assert.equal(validateWall(game, { r: 3, c: 5, o: 'h' }).ok, true);
  assert.equal(validateWall(game, { r: 3, c: 4, o: 'v' }).ok, true);
});

test('rejects out-of-bounds, malformed, and exhausted wall placement', () => {
  for (const wall of [{ r: 8, c: 3, o: 'h' }, { r: 2, c: -1, o: 'v' }, { r: 2.5, c: 3, o: 'h' }, { r: 2, c: 3, o: 'x' }]) {
    assert.equal(validateWall(createGame(), wall).ok, false);
  }
  assert.equal(placeWall({ ...createGame(), remaining: [0, 10] }, { r: 2, c: 2, o: 'h' }).ok, false);
});

test('rejects a wall that seals off the current player', () => {
  const game = fixture([{ r: 8, c: 0 }, { r: 0, c: 4 }], [{ r: 7, c: 0, o: 'h' }]);
  assert.equal(hasPath(game, 0), true);
  assert.match(validateWall(game, { r: 7, c: 1, o: 'v' }).reason, /封死道路/);
});

test('rejects a wall that seals off only the opponent', () => {
  const game = fixture([{ r: 8, c: 4 }, { r: 0, c: 0 }], [{ r: 0, c: 0, o: 'h' }]);
  const wall = { r: 0, c: 1, o: 'v' };
  assert.equal(hasPath(game, 0, [...game.walls, wall]), true);
  assert.equal(hasPath(game, 1, [...game.walls, wall]), false);
  assert.match(validateWall(game, wall).reason, /封死道路/);
});

test('the reachability check treats pawns as movable, not permanent barriers', () => {
  const game = fixture([{ r: 8, c: 0 }, { r: 7, c: 0 }], [{ r: 7, c: 0, o: 'v' }]);
  assert.equal(hasPath(game, 0), true);
});

test('either player wins on any square of the opposite baseline; no actions follow victory', () => {
  for (const player of [0, 1]) {
    const game = createGame();
    game.turn = player;
    game.pawns[player] = { r: player === 0 ? 1 : 7, c: 1 };
    const result = movePawn(game, { r: player === 0 ? 0 : 8, c: 1 });
    assert.equal(result.state.winner, player);
    assert.deepEqual(legalMoves(result.state), []);
    assert.equal(placeWall(result.state, { r: 3, c: 3, o: 'h' }).ok, false);
  }
});

test('mixed legal play preserves both paths, turn order, inventories and previous states', () => {
  let game = createGame();
  for (let i = 0; i < 60 && game.winner === null; i++) {
    const before = JSON.stringify(game);
    const old = game;
    let result;
    if (i % 3 === 0) {
      const choices = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) for (const o of ['h', 'v']) {
        const wall = { r, c, o };
        if (validateWall(game, wall).ok) choices.push(wall);
      }
      if (choices.length) result = placeWall(game, choices[(i * 7) % choices.length]);
    }
    if (!result) {
      const moves = legalMoves(game);
      result = movePawn(game, moves[(i * 5) % moves.length]);
    }
    assert.equal(result.ok, true);
    game = result.state;
    assert.equal(JSON.stringify(old), before);
    assert.equal(hasPath(game, 0), true);
    assert.equal(hasPath(game, 1), true);
    assert.equal(game.remaining[0] + game.remaining[1] + game.walls.length, 20);
    assert.equal(game.turn, game.winner ?? 1 - old.turn);
  }
});
