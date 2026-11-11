// «Чужой трон» — правила игры. Без зависимостей; работает в браузере, в Web Worker и в Node.
(function (root) {
  'use strict';

  const SIZE = 4;
  const OTHER = (color) => (color === 'w' ? 'b' : 'w');

  // Клетки нумеруются слева направо, сверху вниз: a4 = 0, d4 = 3, a1 = 12, d1 = 15.
  const coord = (i) => 'abcd'[i % SIZE] + (SIZE - (i >> 2));
  const at = (name) => (SIZE - Number(name[1])) * SIZE + 'abcd'.indexOf(name[0]);

  // Троны. Побеждают на троне соперника: белые на b3/c3, чёрные на b2/c2.
  const THRONES = { w: [at('b2'), at('c2')], b: [at('b3'), at('c3')] };
  const GOAL = { w: THRONES.b, b: THRONES.w };

  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const DIAGONAL = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  // K — король, R — ладья (до двух клеток по прямой), G — страж (ходит как король, но берётся).
  const PIECES = {
    K: { dirs: ORTHOGONAL.concat(DIAGONAL), range: 1 },
    G: { dirs: ORTHOGONAL.concat(DIAGONAL), range: 1 },
    R: { dirs: ORTHOGONAL, range: 2 },
  };
  const QUIET_LIMIT = 40; // полуходов без взятия до ничьей
  const START = { a1: 'wG', b1: 'wK', d1: 'wR', a4: 'bR', c4: 'bK', d4: 'bG' };

  // Ключ позиции для правила троекратного повторения.
  const key = (state) => state.board.map((p) => p || '..').join('') + state.turn;

  function initial() {
    const board = Array(SIZE * SIZE).fill(null);
    for (const [square, piece] of Object.entries(START)) board[at(square)] = piece;
    const state = { board, turn: 'w', result: null, ply: 0, quiet: 0, counts: {}, lastMove: null };
    state.counts[key(state)] = 1;
    return state;
  }

  // Клетки, до которых фигура с клетки `from` дотягивается по каждому лучу (без учёта других фигур).
  function rays(type, from) {
    const { dirs, range } = PIECES[type];
    const out = [];
    for (const [dr, dc] of dirs) {
      const ray = [];
      let r = (from >> 2) + dr;
      let c = (from % SIZE) + dc;
      for (let step = 0; step < range && r >= 0 && r < SIZE && c >= 0 && c < SIZE; step++, r += dr, c += dc) {
        ray.push(r * SIZE + c);
      }
      if (ray.length) out.push(ray);
    }
    return out;
  }
  const RAYS = {};
  for (const type of Object.keys(PIECES)) RAYS[type] = Array.from({ length: SIZE * SIZE }, (_, i) => rays(type, i));

  function attacked(board, square, by) {
    for (let i = 0; i < board.length; i++) {
      const piece = board[i];
      if (!piece || piece[0] !== by) continue;
      for (const ray of RAYS[piece[1]][i]) {
        for (const target of ray) {
          if (target === square) return true;
          if (board[target]) break;
        }
      }
    }
    return false;
  }

  const inCheck = (board, color) => attacked(board, board.indexOf(color + 'K'), OTHER(color));

  function legalMoves(state) {
    const moves = [];
    const color = state.turn;
    for (let from = 0; from < state.board.length; from++) {
      const piece = state.board[from];
      if (!piece || piece[0] !== color) continue;
      for (const ray of RAYS[piece[1]][from]) {
        for (const to of ray) {
          const target = state.board[to];
          if (target && (target[0] === color || target[1] === 'K')) break; // своих и королей не берут
          const board = state.board.slice();
          board[to] = piece;
          board[from] = null;
          if (!inCheck(board, color)) moves.push({ from, to });
          if (target) break;
        }
      }
    }
    return moves;
  }

  // Король на троне соперника и не под шахом: тот, чей сейчас ход, уже удержал трон.
  const holdsThrone = (board, color) => GOAL[color].includes(board.indexOf(color + 'K')) && !inCheck(board, color);

  // Итог позиции без учёта истории партии (повторений и счётчика тихих ходов).
  function outcome(state) {
    const color = state.turn;
    if (holdsThrone(state.board, color)) return { winner: color, reason: 'throne' };
    if (legalMoves(state).length) return null;
    return inCheck(state.board, color) ? { winner: OTHER(color), reason: 'mate' } : { winner: null, reason: 'stalemate' };
  }

  function advance(state, move) {
    if (state.result) throw new Error('Партия завершена');
    if (!legalMoves(state).some((m) => m.from === move.from && m.to === move.to)) throw new Error('Недопустимый ход');
    const board = state.board.slice();
    const piece = board[move.from];
    const captured = board[move.to];
    board[move.to] = piece;
    board[move.from] = null;
    const next = {
      board,
      turn: OTHER(state.turn),
      result: null,
      ply: state.ply + 1,
      quiet: captured ? 0 : state.quiet + 1,
      counts: { ...state.counts },
      lastMove: { from: move.from, to: move.to, piece, captured },
    };
    next.result = outcome(next);
    const k = key(next);
    next.counts[k] = (next.counts[k] || 0) + 1;
    if (!next.result && next.counts[k] >= 3) next.result = { winner: null, reason: 'repetition' };
    if (!next.result && next.quiet >= QUIET_LIMIT) next.result = { winner: null, reason: 'quiet' };
    return next;
  }

  const api = { SIZE, OTHER, THRONES, GOAL, PIECES, RAYS, QUIET_LIMIT, coord, at, key, initial, attacked, inCheck, legalMoves, holdsThrone, outcome, advance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Throne = api;
})(typeof self !== 'undefined' ? self : this);
