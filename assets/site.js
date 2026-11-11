/* 防災ポケット 共通スクリプト
   - 避難先データ（data/*.json）の読み込みと「出典URL・確認日」チェック
   - 施設の描画（避難先リスト／行動ページの「近くの避難先」／印刷シートで共用）
   - Service Worker 登録・オフライン表示
   施設名や住所はHTMLに書かず、必ずデータファイルから描画する（年1回の更新はデータファイルの編集だけで済む）。 */
(function () {
  'use strict';

  var TYPE_ORDER = ['shelter', 'tsunami', 'temporary', 'wide'];
  var TYPE_INFO = {
    shelter: {
      label: '災害時避難所', icon: '🏫',
      def: '災害後に生活して過ごす場所。災害の状況に応じて開設されます（いつも開いているわけではありません）。'
    },
    tsunami: {
      label: '津波避難ビル', icon: '🏢',
      def: '津波・洪水のときの緊急の避難先。丈夫な建物の3階以上へ。避難情報が出たときに避難できます。'
    },
    temporary: {
      label: '一時避難場所', icon: '🌳',
      def: '地震のときなどに、まず集まる広場・公園です。'
    },
    wide: {
      label: '広域避難場所', icon: '🏞️',
      def: '大きな火事が広がったときに逃げ込む、火に強い広い場所です。'
    }
  };

  /* ---------- 小さな道具 ---------- */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function isHttpsUrl(v) {
    if (typeof v !== 'string') return false;
    try { return new URL(v).protocol === 'https:'; } catch (e) { return false; }
  }
  function isDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var d = new Date(v + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }
  function formatDate(v) {
    if (!isDate(v)) return '';
    var p = v.split('-');
    return Number(p[0]) + '年' + Number(p[1]) + '月' + Number(p[2]) + '日';
  }

  /* ルール1：出典URLと確認日がそろった施設だけを公開する */
  function isPublishable(f) {
    return !!(f && f.name && isHttpsUrl(f.sourceUrl) && isDate(f.checkedDate));
  }
  /* 時間・人数は、その出典がそろっているときだけ表示する */
  function hasDetailSource(f) {
    return isHttpsUrl(f.detailSourceUrl) && isDate(f.detailCheckedDate);
  }

  /* ---------- データ読み込み ---------- */
  var regionPromise = null;
  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  function loadRegion() {
    if (regionPromise) return regionPromise;
    regionPromise = fetchJson('data/regions.json').then(function (idx) {
      var regions = idx.regions || [];
      var meta = regions.filter(function (r) { return r.default; })[0] || regions[0];
      if (!meta) throw new Error('regions.json に地域がありません');
      return fetchJson(meta.file).then(function (data) {
        var all = Array.isArray(data.facilities) ? data.facilities : [];
        var shown = all.filter(isPublishable);
        var region = data.region || {};
        var order = region.areaOrder || [];
        var pri = region.priorityArea;
        var rank = function (f) {
          if (pri && f.area === pri) return -1;
          var i = order.indexOf(f.area);
          return i === -1 ? 999 : i;
        };
        shown.forEach(function (f, i) { f._i = i; });
        shown.sort(function (a, b) { return (rank(a) - rank(b)) || (a._i - b._i); });
        var areas = [];
        shown.forEach(function (f) { if (areas.indexOf(f.area) === -1) areas.push(f.area); });
        return {
          meta: meta,
          data: data,
          region: region,
          facilities: shown,
          hiddenCount: all.length - shown.length,
          areas: areas
        };
      });
    });
    return regionPromise;
  }

  /* ---------- 表示用の整形 ---------- */
  function fullAddress(f, region) {
    if (!f.address) return null;
    return (region.prefix || '') + f.address;
  }
  function mapUrl(f, region) {
    var q = f.mapQuery;
    if (!q && f.address) q = (region.prefix || '') + String(f.address).split(/[、・]/)[0];
    if (!q) q = (region.prefix || '') + ' ' + f.name;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  function sourceTitle(url, data, short) {
    var list = (data && data.sources) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].url === url) return (short && list[i].short) || list[i].title;
    }
    try { return new URL(url).hostname; } catch (e) { return url; }
  }
  function sortedTypes(f) {
    return TYPE_ORDER.filter(function (t) { return (f.types || []).indexOf(t) !== -1; });
  }
  function typeTag(t) {
    var info = TYPE_INFO[t] || { label: t, icon: '' };
    return el('span', { class: 'tag t-' + t }, [info.icon + ' ' + info.label]);
  }

  /* 施設1件の描画（リスト／近くの避難先／共通） */
  function renderFacility(f, ctx, opts) {
    opts = opts || {};
    var region = ctx.region, data = ctx.data;
    var detail = hasDetailSource(f);
    var asTsunami = (f.types || []).indexOf('tsunami') !== -1;

    var hours = detail && f.hours ? f.hours : null;
    var cap = detail && typeof f.capacity === 'number' ? f.capacity.toLocaleString('ja-JP') + '人' : null;
    var none = function () { return el('span', { class: 'none' }, ['公式資料に記載なし']); };

    var addr = fullAddress(f, region);
    var children = [
      el('div', { class: 'fac-tags' }, sortedTypes(f).map(typeTag)),
      el(opts.headingTag || 'h3', { class: 'fac-name' }, [f.name]),
      el('p', { class: 'fac-addr' }, [addr || '番地の記載なし（' + (region.name || '') + f.area + '）']),
      el('dl', { class: 'fac-facts' }, [
        el('dt', null, ['避難可能時間']),
        el('dd', null, [hours || none()]),
        el('dt', null, ['収容人数']),
        el('dd', null, [cap || none()])
      ])
    ];
    if (asTsunami && (hours || cap)) {
      children.push(el('p', { class: 'fac-qual' }, ['※時間・人数は、津波避難ビルとして避難できる時間と人数です。']));
    }
    if (f.note) children.push(el('p', { class: 'fac-note' }, [f.note]));

    var actions = [
      el('a', { class: 'btn primary', href: mapUrl(f, region), target: '_blank', rel: 'noopener' }, ['🗺️ 地図で開く'])
    ];
    if (f.phone && !opts.noPhone) {
      actions.push(el('a', { class: 'btn', href: 'tel:' + f.phone.replace(/[^0-9]/g, '') }, ['📞 ' + f.phone]));
    }
    children.push(el('div', { class: 'fac-actions' }, actions));

    var short = !!opts.compact;
    var src = [
      '出典：',
      el('a', { href: f.sourceUrl, target: '_blank', rel: 'noopener' }, [sourceTitle(f.sourceUrl, data, short)]),
      '（確認日 ' + formatDate(f.checkedDate) + '）'
    ];
    if (detail && (f.hours || f.capacity)) {
      src.push(el('br'), '時間・人数の出典：',
        el('a', { href: f.detailSourceUrl, target: '_blank', rel: 'noopener' }, [sourceTitle(f.detailSourceUrl, data, short)]),
        '（確認日 ' + formatDate(f.detailCheckedDate) + '）');
    }
    children.push(el('p', { class: 'fac-src' }, src));
    return el('li', { class: 'fac', 'data-id': f.id }, children);
  }

  function loadErrorBox() {
    return el('div', { class: 'empty load-error', role: 'alert' }, [
      el('p', null, ['避難先データを読み込めませんでした。']),
      el('p', null, ['通信できる場所で一度このページを開くと、次からは通信なしでも表示できます。']),
      el('p', null, ['今すぐ確認するときは大阪防災アプリか、大正区の公式ページを見てください。'])
    ]);
  }

  /* 行動ページの「近くの避難先」：data-nearby="tsunami,temporary" data-limit="6" */
  function renderNearby() {
    var boxes = document.querySelectorAll('[data-nearby]');
    if (!boxes.length) return;
    loadRegion().then(function (ctx) {
      var pri = ctx.region.priorityArea;
      document.querySelectorAll('[data-priority-area]').forEach(function (n) { if (pri) n.textContent = pri; });
      boxes.forEach(function (box) {
        var types = box.getAttribute('data-nearby').split(',');
        var limit = Number(box.getAttribute('data-limit')) || 5;
        var wholeRegion = box.getAttribute('data-scope') === 'region';
        var where = wholeRegion ? (ctx.region.name || '区内') : pri;
        box.textContent = '';
        types.forEach(function (t) {
          var list = ctx.facilities.filter(function (f) {
            return (wholeRegion || f.area === pri) && (f.types || []).indexOf(t) !== -1;
          });
          var info = TYPE_INFO[t];
          var head = el('h3', { class: 'nearby-head' }, [info.icon + ' ' + where + 'の' + info.label + '（' + list.length + '件）']);
          box.appendChild(head);
          box.appendChild(el('p', { class: 'nearby-def' }, [info.def]));
          if (!list.length) {
            box.appendChild(el('p', { class: 'empty' }, [where + 'には掲載がありません。下のボタンから区内の一覧を見てください。']));
          } else {
            var ul = el('ul', { class: 'fac-list' });
            list.slice(0, limit).forEach(function (f) { ul.appendChild(renderFacility(f, ctx, { headingTag: 'h4', noPhone: true, compact: true })); });
            box.appendChild(ul);
          }
          if (wholeRegion && list.length <= limit) return;
          var label = list.length > limit
            ? 'ほか' + (list.length - limit) + '件と区内の' + info.label + 'を見る'
            : '区内の' + info.label + 'をすべて見る';
          var href = 'shelters.html?type=' + t + (wholeRegion ? '' : '&area=' + encodeURIComponent(pri));
          box.appendChild(el('p', { class: 'more-link' }, [el('a', { class: 'btn dark big', href: href }, [label])]));
        });
      });
    }).catch(function () {
      boxes.forEach(function (box) { box.textContent = ''; box.appendChild(loadErrorBox()); });
    });
  }

  /* ---------- オフライン表示・固定帯の高さ ---------- */
  function syncOnline() {
    document.documentElement.classList.toggle('is-offline', navigator.onLine === false);
  }
  function syncBandHeight() {
    var band = document.querySelector('.band');
    if (band) document.documentElement.style.setProperty('--band-h', band.offsetHeight + 'px');
  }

  /* ---------- Service Worker ---------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* 登録できなくても表示は続ける */ });
    // 保存済みデータが（別サイトのService Workerなどに）消されていたら保存し直してもらう
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.active && navigator.onLine !== false) reg.active.postMessage({ type: 'ensure-cache' });
    }).catch(function () {});
  }

  window.Bousai = {
    TYPE_ORDER: TYPE_ORDER,
    TYPE_INFO: TYPE_INFO,
    el: el,
    formatDate: formatDate,
    isPublishable: isPublishable,
    loadRegion: loadRegion,
    renderFacility: renderFacility,
    loadErrorBox: loadErrorBox,
    mapUrl: mapUrl,
    fullAddress: fullAddress,
    typeTag: typeTag,
    sortedTypes: sortedTypes,
    sourceTitle: sourceTitle
  };

  syncOnline();
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  document.addEventListener('DOMContentLoaded', function () {
    syncBandHeight();
    renderNearby();
    document.querySelectorAll('[data-print]').forEach(function (b) {
      b.addEventListener('click', function () { window.print(); });
    });
  });
  window.addEventListener('resize', syncBandHeight);
  registerSW();
})();
