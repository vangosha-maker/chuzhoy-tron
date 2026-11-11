// Интерфейс: доска, партия, компьютерный соперник и загрузка решённой таблицы.
(() => {
  'use strict';
  const E = Throne;
  const B = ThroneBot;
  const $ = (id) => document.getElementById(id);

  const STORE = 'chuzhoy-tron-v1';
  const NAMES = { K: 'король', R: 'ладья', G: 'страж' };
  const SHORT = { K: 'Кр', R: 'Л', G: 'Ст' };
  const SIDE = { w: 'Белые', b: 'Чёрные' };
  const REASONS = {
    throne: 'Король удержался на троне соперника: ответный ход прошёл, шаха нет.',
    mate: 'Мат: королю некуда уйти от шаха.',
    stalemate: 'Пат: шаха нет, но и ходов нет.',
    repetition: 'Позиция повторилась три раза.',
    quiet: `Прошло ${E.QUIET_LIMIT} полуходов без взятия.`,
  };
  const SHAPES = {
    K: '<path d="M32 7v14m-6-8h12" fill="none" stroke-linecap="round"/><path d="M24 24c-9-7-15 2-9 11l8 8h18l8-8c6-9 0-18-9-11-2-9-14-9-16 0Z"/><path d="M23 42h18l3 10H20Z"/><path d="M19 52h26l3 5H16Z"/><path d="M24 32h16" fill="none"/>',
    R: '<path d="M15 10h8v8h6v-8h6v8h6v-8h8v15l-7 5 2 22H20l2-22-7-5Z"/><path d="M21 29h22M20 47h24" fill="none"/><path d="M18 52h28l3 5H15Z"/>',
    G: '<path d="M32 7 51 13v17c0 13-8 21-19 27C21 51 13 43 13 30V13Z"/><path d="M32 15v33M21 27h22" fill="none" stroke-linecap="round"/>',
  };
  // «1 полуход», «2 полухода», «5 полуходов».
  function plies(n) {
    const tail = n % 100 >= 11 && n % 100 <= 14 ? 'ов' : n % 10 === 1 ? '' : n % 10 >= 2 && n % 10 <= 4 ? 'а' : 'ов';
    return `${n} полуход${tail}`;
  }
  function pieceSvg(piece) {
    const white = piece[0] === 'w';
    const fill = white ? '#fbf5e6' : '#23263a';
    const stroke = white ? '#4b4737' : '#d9d4c4';
    return `<svg class="piece" viewBox="0 0 64 64" aria-hidden="true" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round">${SHAPES[piece[1]]}</svg>`;
  }

  // --- Состояние ---------------------------------------------------------
  let config = { mode: 'bot', color: 'w', level: 'medium' };
  let states = [E.initial()]; // states[i] — позиция после i полуходов
  let moves = [];
  let flipped = false;
  let showEval = false;
  let selected = null;
  let table = null;
  let tableNote = 'Таблица ходов считается…';
  let botTimer = null;
  let toastTimer = null;

  const current = () => states[states.length - 1];
  const botTurn = () => config.mode === 'bot' && !current().result && current().turn !== config.color;

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (!saved) return;
      const cfg = saved.config;
      if (!['bot', 'local'].includes(cfg.mode) || !['w', 'b'].includes(cfg.color) || !B.LEVELS[cfg.level]) return;
      const replay = [E.initial()];
      for (const m of saved.moves) replay.push(E.advance(replay[replay.length - 1], { from: m.from, to: m.to }));
      config = { mode: cfg.mode, color: cfg.color, level: cfg.level };
      states = replay;
      moves = saved.moves.map((m) => ({ from: m.from, to: m.to }));
      flipped = !!saved.flipped;
      showEval = !!saved.showEval;
    } catch (_) { /* повреждённое или недоступное сохранение не мешает игре */ }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ config, moves, flipped, showEval })); } catch (_) { /* играем без сохранения */ }
  }

  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.add('show');
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600);
  }

  // Король, который сейчас сидит на троне соперника и победит, если не получит шах.
  function claim(state) {
    if (state.result) return -1;
    const claimer = E.OTHER(state.turn);
    const king = state.board.indexOf(claimer + 'K');
    return E.GOAL[claimer].includes(king) ? king : -1;
  }

  // --- Отрисовка ---------------------------------------------------------
  function renderBoard() {
    const state = current();
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.square : undefined;
    const legal = selected === null ? [] : E.legalMoves(state).filter((m) => m.from === selected);
    const rated = showEval && table && !state.result && selected !== null ? B.rate(table, state) : null;
    const best = rated ? Math.max(...rated.map((r) => r.value)) : 0;
    const claimSquare = claim(state);
    const winnerKing = state.result && state.result.reason === 'throne' ? state.board.indexOf(state.result.winner + 'K') : -1;

    let html = '';
    for (let n = 0; n < 16; n++) {
      const sq = flipped ? 15 - n : n;
      const piece = state.board[sq];
      const move = legal.find((m) => m.to === sq);
      const throneOf = E.THRONES.w.includes(sq) ? 'w' : E.THRONES.b.includes(sq) ? 'b' : null;
      const classes = ['square'];
      if (((sq >> 2) + (sq % 4)) % 2) classes.push('dark');
      if (selected === sq) classes.push('selected');
      if (state.lastMove && (state.lastMove.from === sq || state.lastMove.to === sq)) classes.push('last');
      if (piece && piece[1] === 'K' && E.inCheck(state.board, piece[0])) classes.push('check');
      if (sq === claimSquare || sq === winnerKing) classes.push('claim');

      let label = E.coord(sq) + (piece ? `, ${piece[0] === 'w' ? 'белый' : 'чёрный'} ${NAMES[piece[1]]}` : ', пусто');
      if (throneOf) label += `, трон ${throneOf === 'w' ? 'белых' : 'чёрных'}`;
      let dot = '';
      if (move) {
        label += ', сюда можно пойти';
        let tone = '';
        if (rated && best > -1) {
          const r = rated.find((x) => x.move.from === move.from && x.move.to === move.to);
          tone = r.value < best ? ' bad' : best === 1 ? ' great' : ' good';
          label += r.value < best ? ', ход ухудшает позицию' : ', надёжный ход';
        }
        dot = `<span class="dot-move${piece ? ' capture' : ''}${tone}"></span>`;
      }
      html += `<button type="button" class="${classes.join(' ')}" data-square="${sq}" aria-label="${label}">`
        + (throneOf ? `<span class="throne ${throneOf === 'b' ? 'of-black' : 'of-white'}"></span>` : '')
        + (piece ? pieceSvg(piece) : '') + dot + '</button>';
    }
    $('board').innerHTML = html;
    $('ranks').innerHTML = (flipped ? '1234' : '4321').split('').map((x) => `<span>${x}</span>`).join('');
    $('files').innerHTML = (flipped ? 'dcba' : 'abcd').split('').map((x) => `<span>${x}</span>`).join('');
    if (focused !== undefined) {
      const again = $('board').querySelector(`[data-square="${focused}"]`);
      if (again) again.focus({ preventScroll: true });
    }
  }

  function renderPlayer(color) {
    const state = current();
    const bot = config.mode === 'bot' && color !== config.color;
    const name = bot ? 'Компьютер' : config.mode === 'local' ? SIDE[color] : 'Вы';
    const sub = bot ? `${SIDE[color]} · ${B.LEVELS[config.level].name}` : config.mode === 'local' ? '' : SIDE[color];
    const taken = ['R', 'G'].map((t) => E.OTHER(color) + t).filter((p) => !state.board.includes(p));
    return `<span class="dot${color === 'b' ? ' black' : ''}" aria-hidden="true"></span>`
      + `<div><div class="name">${name}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`
      + `<span class="taken" aria-label="${taken.length ? 'Взято: ' + taken.map((p) => NAMES[p[1]]).join(', ') : ''}">${taken.map(pieceSvg).join('')}</span>`
      + (!state.result && state.turn === color ? '<span class="turn">ходят</span>' : '');
  }

  function renderStatus() {
    const state = current();
    const card = document.querySelector('.status');
    let label = `Ход ${Math.floor(state.ply / 2) + 1}`;
    let title;
    let text;
    let alert = false;
    const claimSquare = claim(state);
    if (state.result) {
      const { winner, reason } = state.result;
      label = 'Партия окончена';
      title = !winner ? 'Ничья' : config.mode === 'local' ? `${SIDE[winner]} победили` : winner === config.color ? 'Вы победили' : 'Компьютер победил';
      text = REASONS[reason];
    } else if (claimSquare >= 0) {
      const claimer = E.OTHER(state.turn);
      alert = true;
      label = 'Трон под угрозой';
      title = `${SIDE[claimer]} на троне ${E.coord(claimSquare)}`;
      text = botTurn() ? 'Компьютер ищет шах.' : `Нужен шах этим ходом — иначе ${claimer === 'w' ? 'белые' : 'чёрные'} победят.`;
    } else if (E.inCheck(state.board, state.turn)) {
      alert = true;
      title = 'Шах';
      text = 'Уведите короля, закройтесь или возьмите нападающую фигуру.';
    } else {
      title = botTurn() ? 'Компьютер думает…' : config.mode === 'local' ? `Ход ${state.turn === 'w' ? 'белых' : 'чёрных'}` : 'Ваш ход';
      text = state.ply < 2
        ? 'Доведите короля до трона соперника: белым нужны b3 или c3, чёрным — b2 или c2.'
        : 'Король идёт к чужому трону, ладья и страж прикрывают его и стерегут свои троны.';
    }
    card.classList.toggle('alert', alert);
    $('status-label').textContent = label;
    $('status-title').textContent = title;
    $('status-text').textContent = text;
    $('play-again').hidden = !state.result;
    $('undo').disabled = !moves.length || (config.mode === 'bot' && !states.slice(0, -1).some((s) => s.turn === config.color));
  }

  function renderEval() {
    const state = current();
    $('show-eval').checked = showEval;
    $('table-status').textContent = tableNote;
    const verdict = $('verdict');
    verdict.hidden = !showEval;
    if (!showEval) return;
    if (!table) { verdict.textContent = 'Оценка появится, когда таблица будет готова.'; return; }
    if (state.result) { verdict.textContent = 'Партия окончена — в записи отмечены ошибки.'; return; }
    const v = B.judge(table, state);
    const who = SIDE[state.turn];
    if (v.value === 0) {
      const rated = B.rate(table, state);
      const safe = rated.filter((r) => r.value === 0).length;
      verdict.innerHTML = `<b>Ничья при точной игре.</b> Надёжных ходов у ${state.turn === 'w' ? 'белых' : 'чёрных'}: ${safe} из ${rated.length}.`;
    } else if (v.value === 1) {
      verdict.innerHTML = `<b class="win">${who} выигрывают</b> — при точной игре за ${plies(v.plies)}.`;
    } else {
      verdict.innerHTML = `<b class="loss">${who} проигрывают</b> — соперник побеждает не позже чем через ${plies(v.plies)}.`;
    }
  }

  function notation(i) {
    const before = states[i];
    const after = states[i + 1];
    const { from, to } = moves[i];
    const suffix = after.result && after.result.reason === 'mate' ? '#' : E.inCheck(after.board, after.turn) ? '+' : '';
    return `${SHORT[before.board[from][1]]} ${E.coord(from)}${before.board[to] ? '×' : '–'}${E.coord(to)}${suffix}`;
  }

  function renderMoves() {
    const state = current();
    const withMarks = table && (state.result || showEval);
    let marks = 0;
    const cell = (i) => {
      if (i >= moves.length) return '<span></span>';
      const r = withMarks ? B.review(table, states[i], states[i + 1]) : null;
      if (r && r.mark) marks++;
      return `<span class="${i === moves.length - 1 ? 'latest' : ''}">${notation(i)}${r && r.mark ? `<span class="mark">${r.mark}</span>` : ''}</span>`;
    };
    let html = '';
    for (let i = 0; i < moves.length; i += 2) html += `<li><span class="num">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}</li>`;
    const list = $('moves');
    list.innerHTML = html;
    list.scrollTop = list.scrollHeight;
    $('session').textContent = config.mode === 'local' ? 'Вдвоём' : `Вы ${config.color === 'w' ? 'белыми' : 'чёрными'} · ${B.LEVELS[config.level].name}`;
    $('moves-note').textContent = !withMarks ? (state.result && !table ? 'Разбор появится, когда таблица будет готова.' : '')
      : marks ? '? — упущен выигрыш, ?? — ход ведёт к проигрышу.' : moves.length ? 'Ошибок, меняющих исход, нет.' : '';
  }

  function render() {
    renderBoard();
    $('top-player').innerHTML = renderPlayer(flipped ? 'w' : 'b');
    $('bottom-player').innerHTML = renderPlayer(flipped ? 'b' : 'w');
    renderStatus();
    renderEval();
    renderMoves();
  }

  // --- Ход партии --------------------------------------------------------
  function play(move) {
    let next;
    try { next = E.advance(current(), move); } catch (_) { toast('Этот ход недоступен.'); return; }
    states.push(next);
    moves.push({ from: move.from, to: move.to });
    selected = null;
    save();
    render();
    scheduleBot();
  }

  function scheduleBot() {
    clearTimeout(botTimer);
    if (!botTurn()) return;
    botTimer = setTimeout(() => {
      if (!botTurn()) return;
      const move = B.chooseMove(current(), table, config.level);
      if (move) play(move);
    }, 550);
  }

  function newGame(next) {
    clearTimeout(botTimer);
    config = next;
    states = [E.initial()];
    moves = [];
    selected = null;
    flipped = config.mode === 'bot' && config.color === 'b';
    save();
    render();
    scheduleBot();
  }

  $('board').addEventListener('click', (event) => {
    const button = event.target.closest('[data-square]');
    if (!button) return;
    const sq = Number(button.dataset.square);
    const state = current();
    if (state.result) { toast('Партия окончена. Начните новую или верните ход.'); return; }
    if (botTurn()) { toast('Сейчас ход компьютера.'); return; }
    if (selected === sq) { selected = null; renderBoard(); return; }
    if (selected !== null) {
      const move = E.legalMoves(state).find((m) => m.from === selected && m.to === sq);
      if (move) { play(move); return; }
    }
    const piece = state.board[sq];
    if (piece && piece[0] === state.turn) {
      selected = sq;
      renderBoard();
      if (!E.legalMoves(state).some((m) => m.from === sq)) toast('У этой фигуры сейчас нет ходов.');
    } else {
      toast(selected !== null ? 'Сюда нельзя: выберите отмеченную клетку.' : `Выберите ${state.turn === 'w' ? 'белую' : 'чёрную'} фигуру.`);
    }
  });

  $('board').addEventListener('keydown', (event) => {
    const sq = Number(event.target.dataset.square);
    if (!Number.isInteger(sq)) return;
    if (event.key === 'Escape') { selected = null; renderBoard(); return; }
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const screen = flipped ? 15 - sq : sq;
    const target = screen + delta;
    if (target < 0 || target > 15 || (Math.abs(delta) === 1 && (target >> 2) !== (screen >> 2))) return;
    $('board').querySelector(`[data-square="${flipped ? 15 - target : target}"]`).focus();
  });

  $('undo').onclick = () => {
    if (!moves.length) return;
    clearTimeout(botTimer);
    do { states.pop(); moves.pop(); } while (config.mode === 'bot' && moves.length && current().turn !== config.color);
    selected = null;
    save();
    render();
    scheduleBot();
  };
  $('flip').onclick = () => { flipped = !flipped; save(); render(); };
  $('show-eval').onchange = (event) => { showEval = event.target.checked; save(); render(); };

  // --- Диалоги -----------------------------------------------------------
  function levelNote() {
    const level = B.LEVELS[$('level').value];
    $('level-note').textContent = level.errors
      ? `Примерно в ${Math.round(level.errors * 100)}% ходов ошибается, остальные ходы делает точно.`
      : 'Не ошибается никогда. Выиграть у него нельзя — можно только не проиграть.';
  }
  function openSetup() {
    $('mode').value = config.mode;
    $('color').value = config.color;
    $('level').value = config.level;
    $('bot-settings').hidden = config.mode === 'local';
    levelNote();
    $('setup-dialog').showModal();
  }
  $('level').innerHTML = Object.entries(B.LEVELS).map(([id, level]) => `<option value="${id}">${level.name}</option>`).join('');
  $('level').onchange = levelNote;
  $('mode').onchange = () => { $('bot-settings').hidden = $('mode').value === 'local'; };
  $('new-game').onclick = openSetup;
  $('play-again').onclick = openSetup;
  $('setup-form').onsubmit = (event) => {
    event.preventDefault();
    $('setup-dialog').close();
    newGame({ mode: $('mode').value, color: $('color').value, level: $('level').value });
  };
  $('rules-button').onclick = () => $('rules-dialog').showModal();
  document.querySelectorAll('[data-close]').forEach((button) => { button.onclick = () => $(button.dataset.close).close(); });
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));

  // --- Решённая таблица --------------------------------------------------
  // Считается один раз в фоновом потоке (несколько секунд) и кладётся в IndexedDB.
  const DB = { name: 'chuzhoy-tron', store: 'tables', key: 'v1' };
  function openDb() {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB.name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(DB.store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }
  async function cached() {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const request = db.transaction(DB.store).objectStore(DB.store).get(DB.key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }
  async function remember(value) {
    const db = await openDb();
    if (!db) return;
    try { db.transaction(DB.store, 'readwrite').objectStore(DB.store).put(value, DB.key); } catch (_) { /* в следующий раз посчитаем заново */ }
  }
  function useTable(keys, code) {
    table = { keys, code };
    tableNote = `Таблица готова: ${keys.length.toLocaleString('ru-RU')} позиций.`;
    render();
  }
  function tableFailed() {
    tableNote = 'Таблицу посчитать не удалось: компьютер играет упрощённо, оценка недоступна.';
    renderEval();
  }
  async function loadTable() {
    const saved = await cached();
    if (saved && saved.keys instanceof Uint32Array && saved.code instanceof Uint8Array && saved.keys.length === saved.code.length && saved.keys.length) {
      useTable(saved.keys, saved.code);
      return;
    }
    try {
      const source = [$('engine-code').textContent, $('solver-code').textContent,
        'self.onmessage=function(){var last=0;var t=ThroneSolver.solve(function(p){var now=Date.now();if(now-last>150){last=now;self.postMessage({progress:p});}});self.postMessage({keys:t.keys,code:t.code},[t.keys.buffer,t.code.buffer]);};'];
      const url = URL.createObjectURL(new Blob(source, { type: 'text/javascript' }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = (event) => {
        if (event.data.progress !== undefined) {
          tableNote = `Таблица ходов считается… ${Math.round(event.data.progress * 100)}%`;
          $('table-status').textContent = tableNote;
          return;
        }
        worker.terminate();
        useTable(event.data.keys, event.data.code);
        remember({ keys: event.data.keys, code: event.data.code });
      };
      worker.onerror = () => { worker.terminate(); tableFailed(); };
      worker.postMessage('solve');
    } catch (_) { tableFailed(); }
  }

  restore();
  render();
  scheduleBot();
  loadTable();
})();
