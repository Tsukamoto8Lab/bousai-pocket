/* 備蓄リスト：かんたん計算機とチェックリスト（すべてこの端末の中だけで動く。送信なし） */
(function () {
  'use strict';
  var KEY_CALC = 'bousai-pocket.stock.calc.v1';
  var KEY_CHECK = 'bousai-pocket.stock.checks.v1';

  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 保存できない環境でも計算は動かす */ }
  }
  function clamp(n, min, max) {
    n = Math.round(Number(n));
    if (!isFinite(n)) n = min;
    return Math.min(max, Math.max(min, n));
  }

  document.addEventListener('DOMContentLoaded', function () {
    var people = document.getElementById('people');
    var days = document.getElementById('days');
    var saved = load(KEY_CALC, null);
    if (saved) { people.value = clamp(saved.people, 1, 30); days.value = clamp(saved.days, 1, 30); }

    function calc() {
      var p = clamp(people.value, 1, 30);
      var d = clamp(days.value, 1, 30);
      var water = p * d * 3;                       // 1人1日3L
      var bottles = Math.ceil(water / 2);           // 2Lペットボトル
      var meals = p * d * 3;                        // 1人1日3食
      var gas = Math.ceil(p * d * 6 / 7);           // 1人1週間あたり約6本
      document.getElementById('out-water').textContent = water.toLocaleString('ja-JP');
      document.getElementById('out-bottles').textContent = '2Lペットボトル ' + bottles + '本';
      document.getElementById('out-meals').textContent = meals.toLocaleString('ja-JP');
      document.getElementById('out-gas').textContent = gas;
      document.querySelectorAll('[data-days]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-days')) === d));
      });
      save(KEY_CALC, { people: p, days: d });
    }

    document.querySelectorAll('[data-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = b.getAttribute('data-step').split(':');
        var input = document.getElementById(parts[0]);
        input.value = clamp(Number(input.value) + Number(parts[1]), 1, 30);
        calc();
      });
    });
    document.querySelectorAll('[data-days]').forEach(function (b) {
      b.addEventListener('click', function () { days.value = b.getAttribute('data-days'); calc(); });
    });
    [people, days].forEach(function (input) {
      input.addEventListener('input', calc);
      input.addEventListener('change', function () { input.value = clamp(input.value, 1, 30); calc(); });
    });
    calc();

    // チェックリスト
    var checks = load(KEY_CHECK, {});
    var boxes = document.querySelectorAll('.checklist input[type="checkbox"][data-id]');
    boxes.forEach(function (box) {
      box.checked = !!checks[box.getAttribute('data-id')];
      box.addEventListener('change', function () {
        checks[box.getAttribute('data-id')] = box.checked;
        save(KEY_CHECK, checks);
      });
    });
    var clear = document.getElementById('clear-checks');
    if (clear) clear.addEventListener('click', function () {
      if (!window.confirm('チェックを全部外しますか？')) return;
      checks = {};
      boxes.forEach(function (box) { box.checked = false; });
      save(KEY_CHECK, checks);
    });
  });
})();
