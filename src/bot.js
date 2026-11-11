// Компьютерный соперник и разбор ходов по решённой таблице.
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const E = node ? require('./engine.js') : root.Throne;
  const S = node ? require('./solver.js') : root.ThroneSolver;

  // Уровень — это доля ходов, сделанных наугад; остальные ходы точные.
  const LEVELS = {
    easy: { name: 'Новичок', errors: 0.3 },
    medium: { name: 'Любитель', errors: 0.12 },
    hard: { name: 'Мастер', errors: 0.04 },
    perfect: { name: 'Безупречный', errors: 0 },
  };

  // Точная оценка позиции для того, кто в ней ходит: value 1 / 0 / -1 и число полуходов до конца.
  function judge(table, state) {
    if (state.result) {
      if (!state.result.winner) return { value: 0, plies: 0 };
      return { value: state.result.winner === state.turn ? 1 : -1, plies: 0 };
    }
    return S.lookup(table, state);
  }

  // Все ходы с оценкой для ходящего. null, если какой-то позиции нет в таблице.
  function rate(table, state) {
    const rated = [];
    for (const move of E.legalMoves(state)) {
      const next = E.advance(state, move);
      const verdict = judge(table, next);
      if (!verdict) return null;
      rated.push({ move, next, value: -verdict.value, plies: verdict.plies + 1 });
    }
    return rated;
  }

  const pick = (list, random) => list[Math.floor(random() * list.length)];

  function bestMoves(table, rated) {
    const top = Math.max(...rated.map((r) => r.value));
    const group = rated.filter((r) => r.value === top);
    if (top === 1) { // выигрываем — кратчайшим путём
      const fastest = Math.min(...group.map((r) => r.plies));
      return group.filter((r) => r.plies === fastest);
    }
    if (top === -1) { // проигрываем — тянем как можно дольше
      const longest = Math.max(...group.map((r) => r.plies));
      return group.filter((r) => r.plies === longest);
    }
    // Ничья — выбираем ход, после которого сопернику легче всего ошибиться.
    let hardest = -1;
    let out = [];
    for (const r of group) {
      const replies = r.next.result ? null : rate(table, r.next);
      const traps = replies && replies.length ? replies.filter((x) => x.value < 0).length / replies.length : 0;
      if (traps > hardest + 1e-9) { hardest = traps; out = [r]; } else if (Math.abs(traps - hardest) <= 1e-9) out.push(r);
    }
    return out;
  }

  // Запасной вариант, пока таблица не посчитана: неглубокий перебор с простой оценкой.
  function heuristic(state) {
    if (state.result) return state.result.winner ? (state.result.winner === state.turn ? 1e5 : -1e5) : 0;
    let score = 0;
    for (let sq = 0; sq < 16; sq++) {
      const piece = state.board[sq];
      if (!piece) continue;
      let value = { R: 500, G: 300, K: 0 }[piece[1]];
      if (piece[1] === 'K') value += 40 * (piece[0] === 'w' ? 3 - (sq >> 2) : sq >> 2);
      score += piece[0] === state.turn ? value : -value;
    }
    return score;
  }
  function negamax(state, depth, alpha, beta) {
    if (state.result || depth === 0) return heuristic(state);
    let best = -Infinity;
    for (const move of E.legalMoves(state)) {
      const value = -negamax(E.advance(state, move), depth - 1, -beta, -alpha);
      if (value > best) best = value;
      if (value > alpha) alpha = value;
      if (alpha >= beta) break;
    }
    return best;
  }
  function searchMove(state, random) {
    let best = [];
    let top = -Infinity;
    for (const move of E.legalMoves(state)) {
      const value = -negamax(E.advance(state, move), 3, -Infinity, Infinity);
      if (value > top) { top = value; best = [move]; } else if (value === top) best.push(move);
    }
    return pick(best, random);
  }

  function chooseMove(state, table, level, random = Math.random) {
    const moves = E.legalMoves(state);
    if (state.result || !moves.length) return null;
    const errors = (LEVELS[level] || LEVELS.perfect).errors;
    if (random() < errors) return pick(moves, random);
    const rated = table && rate(table, state);
    if (!rated) return searchMove(state, random);
    return pick(bestMoves(table, rated), random).move;
  }

  // Разбор хода: что было до него и что стало после, глазами сделавшего ход.
  // mark: '' — ход не испортил позицию, '?' — упустил выигрыш, '??' — привёл к проигрышу.
  function review(table, before, after) {
    const was = judge(table, before);
    const now = judge(table, after);
    if (!was || !now) return null;
    const value = -now.value;
    const mark = value >= was.value ? '' : value === -1 ? '??' : '?';
    return { was: was.value, now: value, mark };
  }

  const api = { LEVELS, judge, rate, chooseMove, review };
  if (node) module.exports = api;
  else root.ThroneBot = api;
})(typeof self !== 'undefined' ? self : this);
