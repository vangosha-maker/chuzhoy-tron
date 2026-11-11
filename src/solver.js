// Полное решение игры ретроградным анализом и поиск позиции в готовой таблице.
//
// Позиция хранится «глазами того, кто ходит»: если ход чёрных, доска поворачивается на 180°
// и цвета меняются местами (правила при этом не меняются). Из двух зеркальных по вертикали
// позиций берётся одна. Так в таблице остаётся около миллиона позиций вместо четырёх.
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.Throne;

  const SLOTS = ['wK', 'wR', 'wG', 'bK', 'bR', 'bG']; // сначала фигуры ходящего
  const TYPES = SLOTS.map((s) => s[1]);
  const GONE = 16; // «клетка» взятой фигуры
  const BASE = 17;
  const SPACE = BASE ** SLOTS.length;
  const GOAL_MASK = E.GOAL.w.reduce((mask, sq) => mask | (1 << sq), 0);

  // Коды в таблице: 0 — ничья; 1 + n — ходящий выигрывает за n полуходов; 128 + n — проигрывает за n.
  const DRAW = 0, WIN = 1, LOSS = 128;

  const encode = (pos) => ((((pos[5] * BASE + pos[4]) * BASE + pos[3]) * BASE + pos[2]) * BASE + pos[1]) * BASE + pos[0];
  function decode(index, pos) {
    for (let i = 0; i < 6; i++) { pos[i] = index % BASE; index = (index - pos[i]) / BASE; }
  }
  const mirrorSquare = (sq) => (sq === GONE ? GONE : sq ^ 3);
  const flipSquare = (sq) => (sq === GONE ? GONE : 15 - sq);
  function canonical(pos) {
    const a = encode(pos);
    const b = encode(pos.map(mirrorSquare));
    return a < b ? a : b;
  }

  // Индекс позиции из партии (доска из engine.js) в таблице.
  function indexOf(state) {
    const pos = Array(6).fill(GONE);
    const white = state.turn === 'w';
    for (let sq = 0; sq < 16; sq++) {
      const piece = state.board[sq];
      if (!piece) continue;
      const own = piece[0] === state.turn;
      pos[(own ? 0 : 3) + 'KRG'.indexOf(piece[1])] = white ? sq : 15 - sq;
    }
    return canonical(pos);
  }

  function attackedByBlack(pos, board, square) {
    for (let slot = 3; slot < 6; slot++) {
      if (pos[slot] === GONE) continue;
      for (const ray of E.RAYS[TYPES[slot]][pos[slot]]) {
        for (const target of ray) {
          if (target === square) return true;
          if (board[target] >= 0) break;
        }
      }
    }
    return false;
  }

  // Все ходы белых из позиции; для каждого вызывает visit(индекс позиции после хода, глазами соперника).
  // Возвращает число допустимых ходов.
  const board = new Int8Array(16);
  const next = [0, 0, 0, 0, 0, 0];
  const flipped = [0, 0, 0, 0, 0, 0];
  function expand(pos, visit) {
    board.fill(-1);
    for (let slot = 0; slot < 6; slot++) if (pos[slot] !== GONE) board[pos[slot]] = slot;
    let count = 0;
    for (let slot = 0; slot < 3; slot++) {
      const from = pos[slot];
      if (from === GONE) continue;
      for (const ray of E.RAYS[TYPES[slot]][from]) {
        for (const to of ray) {
          const target = board[to];
          if (target >= 0 && (target < 3 || target === 3)) break;
          for (let i = 0; i < 6; i++) next[i] = pos[i];
          next[slot] = to;
          if (target >= 0) next[target] = GONE;
          board[from] = -1; board[to] = slot;
          const legal = !attackedByBlack(next, board, next[0]);
          board[from] = slot; board[to] = target;
          if (legal) {
            count++;
            for (let i = 0; i < 3; i++) { flipped[i] = flipSquare(next[i + 3]); flipped[i + 3] = flipSquare(next[i]); }
            visit(canonical(flipped));
          }
          if (target >= 0) break;
        }
      }
    }
    return count;
  }

  function inCheck(pos) {
    board.fill(-1);
    for (let slot = 0; slot < 6; slot++) if (pos[slot] !== GONE) board[pos[slot]] = slot;
    return attackedByBlack(pos, board, pos[0]);
  }

  function search(keys, index) {
    let lo = 0, hi = keys.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (keys[mid] === index) return mid;
      if (keys[mid] < index) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  }

  function solve(onProgress) {
    const report = onProgress || (() => {});
    const pos = [0, 0, 0, 0, 0, 0];

    // 1. Все позиции, достижимые из начальной.
    const seen = new Uint8Array(Math.ceil(SPACE / 8));
    let keys = new Uint32Array(1 << 20);
    let total = 0;
    const push = (index) => {
      if (seen[index >> 3] & (1 << (index & 7))) return;
      seen[index >> 3] |= 1 << (index & 7);
      if (total === keys.length) { const grown = new Uint32Array(keys.length * 2); grown.set(keys); keys = grown; }
      keys[total++] = index;
    };
    push(indexOf(E.initial()));
    for (let head = 0; head < total; head++) {
      decode(keys[head], pos);
      const done = (GOAL_MASK >> pos[0]) & 1 && !inCheck(pos);
      if (!done) expand(pos, push);
      if ((head & 0xffff) === 0) report(0.3 * head / Math.max(total, 1));
    }
    keys = keys.slice(0, total).sort();

    // 2. Граф ходов и итоги конечных позиций.
    const code = new Uint8Array(total);
    const known = new Uint8Array(total); // 0 — не определено, 1 — выигрыш, 2 — проигрыш ходящего
    const offsets = new Uint32Array(total + 1);
    let edges = new Uint32Array(total * 8);
    let edgeCount = 0;
    const link = (index) => {
      if (edgeCount === edges.length) { const grown = new Uint32Array(edges.length * 2); grown.set(edges); edges = grown; }
      edges[edgeCount++] = search(keys, index);
    };
    const queue = new Uint32Array(total);
    let tail = 0;
    for (let id = 0; id < total; id++) {
      offsets[id] = edgeCount;
      decode(keys[id], pos);
      const check = inCheck(pos);
      if ((GOAL_MASK >> pos[0]) & 1 && !check) { known[id] = 1; code[id] = WIN; queue[tail++] = id; }
      else if (expand(pos, link) === 0 && check) { known[id] = 2; code[id] = LOSS; queue[tail++] = id; }
      if ((id & 0xffff) === 0) report(0.3 + 0.4 * id / total);
    }
    offsets[total] = edgeCount;

    // 3. Обратный граф.
    const predOffsets = new Uint32Array(total + 1);
    for (let e = 0; e < edgeCount; e++) predOffsets[edges[e] + 1]++;
    for (let id = 0; id < total; id++) predOffsets[id + 1] += predOffsets[id];
    const fill = predOffsets.slice(0, total);
    const preds = new Uint32Array(edgeCount);
    const remaining = new Uint32Array(total);
    for (let id = 0; id < total; id++) {
      remaining[id] = offsets[id + 1] - offsets[id];
      for (let e = offsets[id]; e < offsets[id + 1]; e++) preds[fill[edges[e]]++] = id;
    }
    report(0.85);

    // 4. Разметка от конечных позиций назад. Очередь идёт по возрастанию числа полуходов,
    //    поэтому выигрыш получает кратчайшую длину, а проигрыш — самую долгую защиту.
    for (let head = 0; head < tail; head++) {
      const id = queue[head];
      const depth = (known[id] === 1 ? code[id] - WIN : code[id] - LOSS) + 1;
      for (let e = predOffsets[id]; e < predOffsets[id + 1]; e++) {
        const p = preds[e];
        if (known[p]) continue;
        if (known[id] === 2) { known[p] = 1; code[p] = WIN + depth; queue[tail++] = p; }
        else if (--remaining[p] === 0) { known[p] = 2; code[p] = LOSS + depth; queue[tail++] = p; }
      }
    }
    report(1);
    return { keys, code };
  }

  // Оценка позиции из партии: { value: 1 | 0 | -1 для ходящего, plies } или null, если позиции нет в таблице.
  function lookup(table, state) {
    const id = search(table.keys, indexOf(state));
    if (id < 0) return null;
    const c = table.code[id];
    if (c === DRAW) return { value: 0, plies: 0 };
    return c >= LOSS ? { value: -1, plies: c - LOSS } : { value: 1, plies: c - WIN };
  }

  const api = { solve, lookup, indexOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ThroneSolver = api;
})(typeof self !== 'undefined' ? self : this);
