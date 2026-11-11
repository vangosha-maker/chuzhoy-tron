const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const { position, move, names } = require('./helpers.cjs');

test('начальная позиция: восемь ходов, никто не под шахом', () => {
  const s = E.initial();
  assert.deepEqual(names(s), ['a1a2', 'a1b2', 'b1b2', 'b1c1', 'b1c2', 'd1c1', 'd1d2', 'd1d3']);
  assert.equal(E.inCheck(s.board, 'w'), false);
  assert.equal(E.inCheck(s.board, 'b'), false);
});

test('расстановка симметрична при повороте на 180° со сменой цвета', () => {
  const { board } = E.initial();
  for (let sq = 0; sq < 16; sq++) {
    const piece = board[sq];
    const opposite = board[15 - sq];
    assert.equal(opposite, piece ? E.OTHER(piece[0]) + piece[1] : null);
  }
});

test('ладья ходит не дальше двух клеток и не перепрыгивает', () => {
  const s = position({ a1: 'wR', d1: 'wK', a2: 'bG', d4: 'bK' });
  assert.deepEqual(names(s).filter((m) => m.startsWith('a1')), ['a1a2', 'a1b1', 'a1c1']);
  const far = position({ a1: 'wR', d1: 'wK', a4: 'bG', d4: 'bK' });
  assert.ok(!names(far).includes('a1a4'));
});

test('страж ходит как король, его можно брать, королей не берут', () => {
  const s = position({ b2: 'wG', a1: 'wK', c3: 'bG', d4: 'bK' });
  assert.ok(names(s).includes('b2c3'));
  const next = E.advance(s, move('b2', 'c3'));
  assert.equal(next.lastMove.captured, 'bG');
  const nearKing = position({ c3: 'wG', a1: 'wK', d4: 'bK' });
  assert.ok(!names(nearKing).includes('c3d4'));
});

test('нельзя оставить своего короля под шахом', () => {
  const s = position({ a1: 'wK', a2: 'wG', a3: 'bR', d4: 'bK' });
  assert.ok(!names(s).some((m) => m.startsWith('a2') && m !== 'a2a3'));
});

test('трон соперника: победа после одного ответа без шаха', () => {
  const s = position({ b2: 'wK', a1: 'wG', a4: 'bR', d4: 'bK' });
  const claim = E.advance(s, move('b2', 'b3'));
  assert.equal(claim.result, null);
  const reply = E.advance(claim, move('d4', 'd3'));
  assert.deepEqual(reply.result, { winner: 'w', reason: 'throne' });
});

test('шах срывает захват трона', () => {
  const s = position({ b2: 'wK', a1: 'wG', a4: 'bR', d4: 'bK' });
  const claim = E.advance(s, move('b2', 'b3'));
  const check = E.advance(claim, move('a4', 'a3'));
  assert.equal(check.result, null);
  assert.equal(E.inCheck(check.board, 'w'), true);
});

test('свой трон победы не даёт', () => {
  const s = position({ b1: 'wK', a1: 'wG', a4: 'bR', d4: 'bK' });
  const own = E.advance(s, move('b1', 'b2'));
  const reply = E.advance(own, move('d4', 'd3'));
  assert.equal(reply.result, null);
});

test('мат — победа', () => {
  const s = position({ c2: 'wK', b2: 'wR', b3: 'wG', a4: 'bK' });
  const mate = E.advance(s, move('b2', 'a2'));
  assert.deepEqual(mate.result, { winner: 'w', reason: 'mate' });
});

test('пат — ничья', () => {
  const s = position({ c4: 'wK', b1: 'wR', a4: 'bK' });
  const stalemate = E.advance(s, move('b1', 'a1'));
  assert.deepEqual(stalemate.result, { winner: null, reason: 'stalemate' });
});

test('одни короли — партия продолжается, трон по-прежнему даёт победу', () => {
  const s = position({ a1: 'wK', a2: 'bG', d4: 'bK' });
  const bare = E.advance(s, move('a1', 'a2'));
  assert.equal(bare.result, null);
  const race = position({ b2: 'wK', d4: 'bK' });
  const claim = E.advance(race, move('b2', 'b3'));
  assert.equal(claim.result, null);
  // Чёрный король не может подойти вплотную и не может дать шах — трон удержан.
  const reply = E.advance(claim, E.legalMoves(claim)[0]);
  assert.deepEqual(reply.result, { winner: 'w', reason: 'throne' });
});

test('троекратное повторение — ничья', () => {
  let s = E.initial();
  const loop = [['d1', 'd2'], ['a4', 'a3'], ['d2', 'd1'], ['a3', 'a4']];
  for (let i = 0; i < 2; i++) for (const [from, to] of loop) s = E.advance(s, move(from, to));
  assert.deepEqual(s.result, { winner: null, reason: 'repetition' });
});

test('40 полуходов без взятия — ничья, взятие обнуляет счётчик', () => {
  const s = position({ a1: 'wK', d1: 'wR', a4: 'bK', d4: 'bR' }, 'w', E.QUIET_LIMIT - 1);
  assert.deepEqual(E.advance(s, move('a1', 'b1')).result, { winner: null, reason: 'quiet' });
  const capture = position({ a1: 'wK', d2: 'wR', a4: 'bK', d4: 'bR' }, 'w', E.QUIET_LIMIT - 1);
  const next = E.advance(capture, move('d2', 'd4'));
  assert.equal(next.quiet, 0);
  assert.equal(next.result, null);
});

test('недопустимый ход и ход после конца партии отклоняются', () => {
  const s = E.initial();
  assert.throws(() => E.advance(s, move('a1', 'a3')), /Недопустимый ход/);
  const done = position({ c2: 'wK', b2: 'wR', b3: 'wG', a4: 'bK' });
  const mate = E.advance(done, move('b2', 'a2'));
  assert.throws(() => E.advance(mate, move('c2', 'c1')), /Партия завершена/);
});
