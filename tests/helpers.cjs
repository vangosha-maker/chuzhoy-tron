const E = require('../src/engine.js');

// Позиция из описания вида { b3: 'wK', a4: 'bK' }.
function position(pieces, turn = 'w', quiet = 0) {
  const state = E.initial();
  state.board = Array(16).fill(null);
  for (const [square, piece] of Object.entries(pieces)) state.board[E.at(square)] = piece;
  state.turn = turn;
  state.quiet = quiet;
  state.counts = { [E.key(state)]: 1 };
  return state;
}
const move = (from, to) => ({ from: E.at(from), to: E.at(to) });
const names = (state) => E.legalMoves(state).map((m) => E.coord(m.from) + E.coord(m.to)).sort();

// Детерминированный генератор случайных чисел для воспроизводимых тестов.
function seeded(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { position, move, names, seeded };
