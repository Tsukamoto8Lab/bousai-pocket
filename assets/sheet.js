/* 冷蔵庫用 印刷シート：避難先3つをデータファイルから描画。選択はこの端末の localStorage にだけ保存。 */
(function () {
  'use strict';
  var B = window.Bousai;
  var el = B.el;
  var KEY = 'bousai-pocket.sheet.v1';
  var COUNT = 3;

  function loadSel() {
    try { var v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : null; } catch (e) { return null; }
  }
  function saveSel(ids) {
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) { /* noop */ }
  }

  function start(ctx) {
    var byId = {};
    ctx.facilities.forEach(function (f) { byId[f.id] = f; });

    var sel = (loadSel() || ctx.data.printDefaults || []).filter(function (id) { return byId[id]; });
    ctx.facilities.forEach(function (f) { if (sel.length < COUNT && sel.indexOf(f.id) === -1) sel.push(f.id); });
    sel = sel.slice(0, COUNT);

    // 選択欄（画面のみ）
    var pickers = document.getElementById('pickers');
    pickers.textContent = '';
    for (var i = 0; i < COUNT; i++) {
      var id = 'pick-' + i;
      var select = el('select', { id: id, 'data-index': String(i) });
      B.TYPE_ORDER.forEach(function (t) {
        var group = el('optgroup', { label: B.TYPE_INFO[t].label });
        ctx.facilities.forEach(function (f) {
          if (B.sortedTypes(f)[0] !== t) return;
          group.appendChild(el('option', { value: f.id }, [f.name + '（' + f.area + '）']));
        });
        if (group.children.length) select.appendChild(group);
      });
      select.value = sel[i];
      select.addEventListener('change', function (e) {
        sel[Number(e.target.getAttribute('data-index'))] = e.target.value;
        saveSel(sel);
        render();
      });
      pickers.appendChild(el('div', { class: 'field' }, [el('label', { for: id }, ['避難先 ' + (i + 1)]), select]));
    }
    pickers.appendChild(el('p', { class: 'list-tools' }, [
      (function () {
        var b = el('button', { type: 'button', class: 'btn' }, ['はじめの3つに戻す']);
        b.addEventListener('click', function () {
          try { localStorage.removeItem(KEY); } catch (e) { /* noop */ }
          sel = (ctx.data.printDefaults || []).filter(function (id) { return byId[id]; }).slice(0, COUNT);
          pickers.querySelectorAll('select').forEach(function (s, idx) { s.value = sel[idx]; });
          render();
        });
        return b;
      })()
    ]));

    function render() {
      var ol = document.getElementById('sheet-shelters');
      ol.textContent = '';
      var sources = {};
      sel.forEach(function (fid) {
        var f = byId[fid];
        if (!f) return;
        var types = B.sortedTypes(f).map(function (t) { return B.TYPE_INFO[t].label; }).join('・');
        var addr = B.fullAddress(f, ctx.region) || '番地の記載なし';
        var asTsunami = (f.types || []).indexOf('tsunami') !== -1;
        var hours = f.hours && f.detailSourceUrl
          ? (asTsunami ? '津波避難ビルとして避難できる時間：' : '避難できる時間：') + f.hours
          : '避難できる時間：公式資料に記載なし';
        ol.appendChild(el('li', null, [
          el('span', { class: 'sh-type' }, [types]),
          el('span', { class: 'sh-name' }, [f.name]),
          el('span', { class: 'sh-addr' }, [addr]),
          el('span', { class: 'sh-hours' }, [hours])
        ]));
        sources[f.sourceUrl] = f.checkedDate;
        if (f.hours && f.detailSourceUrl) sources[f.detailSourceUrl] = f.detailCheckedDate;
      });
      var src = document.getElementById('sheet-source');
      src.textContent = '避難先の出典：' + Object.keys(sources).map(function (u) {
        return B.sourceTitle(u, ctx.data) + ' ' + u + '（確認日 ' + B.formatDate(sources[u]) + '）';
      }).join('／');
    }
    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var d = new Date();
    document.getElementById('sheet-date').textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    B.loadRegion().then(start).catch(function () {
      var p = document.getElementById('pickers');
      p.textContent = '';
      p.appendChild(B.loadErrorBox());
      var ol = document.getElementById('sheet-shelters');
      ol.textContent = '';
      ol.appendChild(el('li', null, ['（避難先を読み込めませんでした。手書きで記入してください）']));
    });
  });
})();
