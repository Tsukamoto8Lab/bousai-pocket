/* うちの集合場所・連絡メモ：localStorage にだけ保存（サーバー送信なし・公開データに混ぜない） */
(function () {
  'use strict';
  var KEY = 'bousai-pocket.memo.v1';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var fields = document.querySelectorAll('[data-memo]');
    var status = document.getElementById('memo-status');
    var memo = load();
    var timer = null;

    fields.forEach(function (f) {
      f.value = memo[f.getAttribute('data-memo')] || '';
      f.addEventListener('input', function () {
        memo[f.getAttribute('data-memo')] = f.value;
        clearTimeout(timer);
        timer = setTimeout(function () {
          try {
            localStorage.setItem(KEY, JSON.stringify(memo));
            status.textContent = '保存しました（この端末だけ）';
          } catch (e) {
            status.textContent = 'この端末では保存できませんでした（プライベートモードなど）。紙に書いておいてください。';
          }
        }, 300);
      });
    });

    document.getElementById('memo-clear').addEventListener('click', function () {
      if (!window.confirm('この端末のメモを消しますか？元に戻せません。')) return;
      try { localStorage.removeItem(KEY); } catch (e) { /* noop */ }
      memo = {};
      fields.forEach(function (f) { f.value = ''; });
      status.textContent = 'メモを消しました';
    });
  });
})();
