/* 避難先リスト：種別タブ・町名フィルタ・キーワード検索。データは data/*.json から描画。 */
(function () {
  'use strict';
  var B = window.Bousai;
  var el = B.el;

  var params = new URLSearchParams(location.search);
  var state = {
    type: B.TYPE_ORDER.indexOf(params.get('type')) !== -1 ? params.get('type') : 'shelter',
    area: params.get('area') || '',
    q: params.get('q') || ''
  };

  function norm(s) {
    return String(s || '')
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[－ー−‐―]/g, '-')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  function matches(f, ctx, opts) {
    if ((f.types || []).indexOf(opts.type) === -1) return false;
    if (opts.area && f.area !== opts.area) return false;
    if (opts.q) {
      var hay = norm(f.name + ' ' + (f.address || '') + ' ' + f.area + ' ' + (ctx.region.prefix || ''));
      if (hay.indexOf(norm(opts.q)) === -1) return false;
    }
    return true;
  }

  function syncUrl() {
    var p = new URLSearchParams();
    p.set('type', state.type);
    if (state.area) p.set('area', state.area);
    if (state.q) p.set('q', state.q);
    history.replaceState(null, '', location.pathname + '?' + p.toString());
  }

  function start(ctx) {
    var tabsBox = document.getElementById('tabs');
    var defBox = document.getElementById('type-def');
    var areasBox = document.getElementById('areas');
    var qInput = document.getElementById('q');
    var meta = document.getElementById('result-meta');
    var results = document.getElementById('results');
    var pri = ctx.region.priorityArea;

    if (state.area && ctx.areas.indexOf(state.area) === -1) state.area = '';
    qInput.value = state.q;

    if (ctx.data.listTitle) {
      document.getElementById('list-basis').textContent =
        '大阪市の公式リスト「' + ctx.data.listTitle + '」をもとに掲載しています。' + (pri ? pri + 'を先頭に表示します。' : '');
    }

    // 出典一覧
    var srcList = document.getElementById('src-list');
    (ctx.data.sources || []).forEach(function (s) {
      srcList.appendChild(el('li', null, [
        el('a', { href: s.url, target: '_blank', rel: 'noopener', class: 'print-url' }, [s.title]),
        s.use ? '（' + s.use + '）' : ''
      ]));
    });
    // 掲載していない施設の注記（指定取消など）＋出典欠けで非表示の件数
    var exList = document.getElementById('excluded-list');
    (ctx.data.excludedNotes || []).forEach(function (t) { exList.appendChild(el('li', { class: 'dont' }, [t])); });
    if (ctx.hiddenCount > 0) {
      exList.appendChild(el('li', { class: 'dont' }, ['出典URLか確認日が欠けているため表示していない施設：' + ctx.hiddenCount + '件']));
    }
    if (exList.children.length) document.getElementById('excluded').hidden = false;

    // タブ
    var tabButtons = {};
    B.TYPE_ORDER.forEach(function (t) {
      var info = B.TYPE_INFO[t];
      var count = el('span', { class: 'count' });
      var btn = el('button', {
        type: 'button', class: 'tab', role: 'tab', id: 'tab-' + t,
        'aria-controls': 'results', 'aria-selected': String(t === state.type)
      }, [el('span', { class: 'tab-label' }, [el('span', { class: 'dot t-' + t, 'aria-hidden': 'true' }), info.label]), count]);
      btn.addEventListener('click', function () { state.type = t; render(); });
      tabButtons[t] = { btn: btn, count: count };
      tabsBox.appendChild(btn);
    });
    tabsBox.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var i = B.TYPE_ORDER.indexOf(state.type);
      i = (i + (e.key === 'ArrowRight' ? 1 : -1) + B.TYPE_ORDER.length) % B.TYPE_ORDER.length;
      state.type = B.TYPE_ORDER[i];
      render();
      tabButtons[state.type].btn.focus();
    });

    // 町名チップ
    var chipButtons = [];
    function addChip(value, label, cls) {
      var b = el('button', { type: 'button', class: 'chip' + (cls ? ' ' + cls : ''), 'aria-pressed': 'false' }, [label]);
      b.addEventListener('click', function () { state.area = value; render(); });
      chipButtons.push({ value: value, btn: b });
      areasBox.appendChild(b);
    }
    addChip('', 'すべて');
    ctx.areas.forEach(function (a) { addChip(a, a, a === pri ? 'priority' : ''); });

    var timer = null;
    qInput.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = qInput.value.trim(); render(); }, 150);
    });

    function render() {
      syncUrl();
      B.TYPE_ORDER.forEach(function (t) {
        var n = ctx.facilities.filter(function (f) { return matches(f, ctx, { type: t, area: state.area, q: state.q }); }).length;
        tabButtons[t].count.textContent = n + '件';
        tabButtons[t].btn.setAttribute('aria-selected', String(t === state.type));
        tabButtons[t].btn.tabIndex = t === state.type ? 0 : -1;
      });
      chipButtons.forEach(function (c) { c.btn.setAttribute('aria-pressed', String(c.value === state.area)); });

      var info = B.TYPE_INFO[state.type];
      defBox.textContent = '';
      defBox.appendChild(el('b', null, [info.icon + ' ' + info.label + '：']));
      defBox.appendChild(document.createTextNode(info.def));
      if (state.type === 'tsunami') {
        defBox.appendChild(el('br'));
        defBox.appendChild(document.createTextNode('※避難する階が浸水しない高さか確認してから避難してください。避難できる時間が決まっている建物もあります。'));
      }

      var list = ctx.facilities.filter(function (f) { return matches(f, ctx, state); });
      meta.textContent = info.label + '：' + (state.area ? state.area + 'の' : '大正区内の') + list.length + '件' +
        (state.q ? '（「' + state.q + '」で検索）' : '') + (!state.area && pri ? '。' + pri + 'が先頭です' : '');

      results.textContent = '';
      if (!list.length) {
        results.appendChild(el('div', { class: 'empty' }, [
          el('p', null, ['条件に合う' + info.label + 'はありません。']),
          el('p', null, ['ほかの種類のタブを選ぶか、町名を「すべて」にしてください。'])
        ]));
        return;
      }
      var groups = [];
      list.forEach(function (f) {
        var g = groups[groups.length - 1];
        if (!g || g.area !== f.area) groups.push(g = { area: f.area, items: [] });
        g.items.push(f);
      });
      groups.forEach(function (g) {
        var head = el('h2', { class: 'area-head' }, [g.area, el('small', null, [g.items.length + '件'])]);
        if (g.area === pri) head.appendChild(el('span', { class: 'pin' }, ['先頭に固定']));
        var ul = el('ul', { class: 'fac-list' });
        g.items.forEach(function (f) { ul.appendChild(B.renderFacility(f, ctx)); });
        results.appendChild(el('section', { class: 'area-group' }, [head, ul]));
      });
    }
    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    B.loadRegion().then(start).catch(function () {
      var results = document.getElementById('results');
      results.textContent = '';
      results.appendChild(B.loadErrorBox());
    });
  });
})();
