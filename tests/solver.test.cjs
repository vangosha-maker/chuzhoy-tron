const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const S = require('../src/solver.js');
const B = require('../src/bot.js');
const { seeded } = require('./helpers.cjs');

const table = S.solve();

test('таблица покрывает 1 046 490 позиций', () => {
  assert.equal(table.keys.length, 1046490);
});

test('начальная позиция ничейна; из восьми первых ходов проигрывает только Лd1–d3', () => {
  const start = E.initial();
  assert.deepEqual(S.lookup(table, start), { value: 0, plies: 0 });
  const verdicts = {};
  for (const m of E.legalMoves(start)) {
    verdicts[E.coord(m.from) + E.coord(m.to)] = S.lookup(table, E.advance(start, m));
  }
  assert.deepEqual(verdicts.d1d3, { value: 1, plies: 13 }); // чёрные выигрывают за 13 полуходов
  for (const [name, v] of Object.entries(verdicts)) if (name !== 'd1d3') assert.equal(v.value, 0, name);
});

test('самый длинный форсированный выигрыш — 36 полуходов, меньше лимита тихих ходов', () => {
  let longest = 0;
  for (const c of table.code) if (c > 0 && c < 128 && c - 1 > longest) longest = c - 1;
  assert.equal(longest, 36);
  assert.ok(longest < E.QUIET_LIMIT);
});

test('оценки согласованы с оценками позиций после каждого хода', () => {
  const random = seeded(7);
  let checked = 0;
  for (let game = 0; game < 300; game++) {
    let s = E.initial();
    while (!s.result) {
      const here = S.lookup(table, s);
      assert.ok(here, 'позиция из партии есть в таблице');
      const moves = E.legalMoves(s);
      const children = moves.map((m) => B.judge(table, E.advance({ ...s, counts: {}, quiet: 0 }, m)));
      const best = Math.max(...children.map((c) => 0 - c.value));
      assert.equal(here.value, best);
      if (here.value === 1) assert.equal(here.plies, 1 + Math.min(...children.filter((c) => c.value === -1).map((c) => c.plies)));
      if (here.value === -1) assert.equal(here.plies, 1 + Math.max(...children.map((c) => c.plies)));
      checked++;
      s = E.advance(s, moves[Math.floor(random() * moves.length)]);
    }
  }
  assert.ok(checked > 3000);
});

test('безупречный бот не проигрывает случайному сопернику ни за один цвет', () => {
  const random = seeded(11);
  const score = { win: 0, draw: 0, loss: 0 };
  for (let game = 0; game < 200; game++) {
    const bot = game % 2 ? 'w' : 'b';
    let s = E.initial();
    while (!s.result) {
      const moves = E.legalMoves(s);
      s = E.advance(s, s.turn === bot ? B.chooseMove(s, table, 'perfect', random) : moves[Math.floor(random() * moves.length)]);
    }
    score[s.result.winner === bot ? 'win' : s.result.winner ? 'loss' : 'draw']++;
  }
  assert.equal(score.loss, 0);
  assert.ok(score.win > 180, JSON.stringify(score));
});

test('два безупречных бота всегда играют вничью', () => {
  const random = seeded(3);
  for (let game = 0; game < 30; game++) {
    let s = E.initial();
    while (!s.result) s = E.advance(s, B.chooseMove(s, table, 'perfect', random));
    assert.equal(s.result.winner, null);
  }
});

test('разбор отмечает проигрывающий ход', () => {
  const start = E.initial();
  const blunder = E.advance(start, { from: E.at('d1'), to: E.at('d3') });
  assert.equal(B.review(table, start, blunder).mark, '??');
  const fine = E.advance(start, { from: E.at('b1'), to: E.at('b2') });
  assert.equal(B.review(table, start, fine).mark, '');
});

test('без таблицы бот всё равно делает допустимый ход', () => {
  const s = E.initial();
  const m = B.chooseMove(s, null, 'perfect', seeded(1));
  assert.ok(E.legalMoves(s).some((x) => x.from === m.from && x.to === m.to));
});
