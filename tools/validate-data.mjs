#!/usr/bin/env node
// 避難先データの検証スクリプト（依存パッケージなし）
//   使い方:  node tools/validate-data.mjs
// 出典URL（sourceUrl）か確認日（checkedDate）が欠けた施設があるとエラー終了します。
// サイト側（assets/site.js）でも同じ条件の施設は表示から除外されます（二重チェック）。

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = new Set(['shelter', 'tsunami', 'temporary', 'wide']);
const STALE_DAYS = 400; // 確認日がこれより古いと警告（年1回の更新目安）

const errors = [];
const warnings = [];

const isHttpsUrl = (v) => {
  if (typeof v !== 'string') return false;
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
};
const isDate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const daysSince = (v) => Math.floor((Date.now() - new Date(v + 'T00:00:00Z').getTime()) / 86400000);

async function readJson(rel) {
  const text = await readFile(path.join(root, rel), 'utf8');
  try { return JSON.parse(text); } catch (e) { throw new Error(`${rel}: JSONの書き方が正しくありません (${e.message})`); }
}

const index = await readJson('data/regions.json');
if (!Array.isArray(index.regions) || index.regions.length === 0) errors.push('data/regions.json: regions が空です');

for (const r of index.regions ?? []) {
  const file = r.file;
  let data;
  try { data = await readJson(file); } catch (e) { errors.push(e.message); continue; }
  const where = (f, i) => `${file} #${i + 1} ${f?.id ?? '(idなし)'} ${f?.name ?? ''}`.trim();

  const region = data.region ?? {};
  if (!region.name) errors.push(`${file}: region.name がありません`);
  if (!region.priorityArea) warnings.push(`${file}: region.priorityArea がありません（先頭固定する町名）`);
  const areaOrder = Array.isArray(region.areaOrder) ? region.areaOrder : [];

  const list = Array.isArray(data.facilities) ? data.facilities : [];
  if (list.length === 0) errors.push(`${file}: facilities が空です`);

  const ids = new Set();
  let publishable = 0;
  list.forEach((f, i) => {
    const w = where(f, i);
    if (!f.id) errors.push(`${w}: id がありません`);
    else if (ids.has(f.id)) errors.push(`${w}: id が重複しています`);
    else ids.add(f.id);
    if (!f.name) errors.push(`${w}: name がありません`);

    // ルール1: 出典URLと確認日のない施設は公開しない
    const okSource = isHttpsUrl(f.sourceUrl);
    const okDate = isDate(f.checkedDate);
    if (!okSource) errors.push(`${w}: sourceUrl（出典の公式URL, https）がありません → サイトでは非表示になります`);
    if (!okDate) errors.push(`${w}: checkedDate（確認日 YYYY-MM-DD）がありません → サイトでは非表示になります`);
    if (okSource && okDate) publishable++;
    if (okDate && daysSince(f.checkedDate) > STALE_DAYS) warnings.push(`${w}: 確認日 ${f.checkedDate} が${STALE_DAYS}日以上前です。最新の公式リストで照合してください`);

    if (!Array.isArray(f.types) || f.types.length === 0) errors.push(`${w}: types がありません`);
    else for (const t of f.types) if (!TYPES.has(t)) errors.push(`${w}: types に未知の種別 "${t}"（使えるのは ${[...TYPES].join(', ')}）`);

    if (!f.area) errors.push(`${w}: area（町名）がありません`);
    else if (areaOrder.length && !areaOrder.includes(f.area)) warnings.push(`${w}: area "${f.area}" が region.areaOrder にありません（並び順の末尾になります）`);
    if (!f.address && !f.mapQuery) warnings.push(`${w}: address も mapQuery もないため地図リンクを作れません`);

    // 時間・人数を載せるなら、その出典も必須
    const hasDetail = (f.hours ?? null) !== null || (f.capacity ?? null) !== null;
    if (hasDetail) {
      if (!isHttpsUrl(f.detailSourceUrl)) errors.push(`${w}: hours/capacity があるのに detailSourceUrl（その出典）がありません → 時間・人数は非表示になります`);
      if (!isDate(f.detailCheckedDate)) errors.push(`${w}: hours/capacity があるのに detailCheckedDate がありません → 時間・人数は非表示になります`);
    }
    if (f.capacity != null && !(Number.isInteger(f.capacity) && f.capacity > 0)) errors.push(`${w}: capacity は正の整数にしてください`);
  });

  for (const id of data.printDefaults ?? []) {
    if (!ids.has(id)) errors.push(`${file}: printDefaults の "${id}" が facilities にありません（印刷シートの初期表示に使います）`);
  }

  console.log(`■ ${file}`);
  console.log(`  施設 ${list.length} 件（公開できる ${publishable} 件）`);
  const count = {};
  list.forEach((f) => (f.types ?? []).forEach((t) => { count[t] = (count[t] ?? 0) + 1; }));
  console.log(`  種別: ${Object.entries(count).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

if (warnings.length) {
  console.log(`\n注意 ${warnings.length} 件`);
  warnings.forEach((m) => console.log('  - ' + m));
}
if (errors.length) {
  console.error(`\nエラー ${errors.length} 件`);
  errors.forEach((m) => console.error('  ✗ ' + m));
  process.exit(1);
}
console.log('\nOK: すべての施設に出典URLと確認日があります。');
