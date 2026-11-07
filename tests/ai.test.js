import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, legalMoves, hasPath, movePawn, placeWall } from '../src/game.js';
import { chooseComputerAction } from '../src/ai.js';

const play = (game, action) => action.type === 'move' ? movePawn(game, action.to) : placeWall(game, action.wall);
const computerGame = () => ({ ...createGame(), turn: 1 });

test('computer advances toward its goal in the opening', () => {
  assert.deepEqual(chooseComputerAction(computerGame()), { type: 'move', to: { r: 1, c: 4 } });
});

test('computer takes an immediate winning move instead of placing a wall', () => {
  const game = computerGame();
  game.pawns[1] = { r: 7, c: 1 };
  const result = play(game, chooseComputerAction(game));
  assert.equal(result.state.winner, 1);
});

test('computer recognizes a winning jump over the other pawn', () => {
  const game = computerGame();
  game.pawns = [{ r: 7, c: 4 }, { r: 6, c: 4 }];
  const action = chooseComputerAction(game);
  assert.deepEqual(action, { type: 'move', to: { r: 8, c: 4 } });
});

test('computer places a wall to prevent the opponent winning next turn', () => {
  const game = computerGame();
  game.pawns = [{ r: 1, c: 4 }, { r: 4, c: 6 }];
  const action = chooseComputerAction(game);
  assert.equal(action.type, 'wall');
  const result = play(game, action);
  assert.equal(result.ok, true);
  assert.equal(legalMoves(result.state, 0).some((cell) => cell.r === 0), false);
});

test('computer does not offer the opponent an immediate winning jump', () => {
  const game = computerGame();
  game.pawns = [{ r: 2, c: 4 }, { r: 0, c: 4 }];
  const result = play(game, chooseComputerAction(game));
  assert.equal(result.ok, true);
  assert.equal(legalMoves(result.state, 0).some((cell) => cell.r === 0), false);
});

test('with no walls left the computer still makes a legal move', () => {
  const game = computerGame();
  game.remaining[1] = 0;
  game.walls = [{ r: 0, c: 3, o: 'h', owner: 0 }];
  const action = chooseComputerAction(game);
  assert.equal(action.type, 'move');
  assert.equal(play(game, action).ok, true);
});

test('an existing maze is navigated without mutating the source position', () => {
  const game = computerGame();
  game.walls = [{ r: 0, c: 3, o: 'h', owner: 0 }, { r: 0, c: 4, o: 'v', owner: 1 }, { r: 3, c: 4, o: 'h', owner: 0 }];
  game.remaining = [8, 9];
  const before = JSON.stringify(game);
  const result = play(game, chooseComputerAction(game));
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(game), before);
  assert.equal(hasPath(result.state, 0), true);
  assert.equal(hasPath(result.state, 1), true);
});

test('computer stops choosing actions after either player wins', () => {
  for (const winner of [0, 1]) assert.equal(chooseComputerAction({ ...computerGame(), winner }), null);
});

test('full computer games finish and preserve every game invariant', () => {
  for (const withWalls of [false, true]) {
    let game = createGame();
    if (withWalls) {
      game.walls = [{ r: 1, c: 3, o: 'h', owner: 0 }, { r: 6, c: 4, o: 'h', owner: 1 }];
      game.remaining = [9, 9];
    }
    let actions = 0;
    while (game.winner === null && actions < 160) {
      const result = play(game, chooseComputerAction(game));
      assert.equal(result.ok, true);
      game = result.state;
      assert.equal(hasPath(game, 0), true);
      assert.equal(hasPath(game, 1), true);
      assert.equal(game.remaining[0] + game.remaining[1] + game.walls.length, 20);
      actions++;
    }
    assert.notEqual(game.winner, null, 'the game must finish instead of cycling');
    assert.equal(chooseComputerAction(game), null);
  }
});
