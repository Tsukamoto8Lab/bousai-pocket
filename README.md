# 防災ポケット

大阪市大正区（鶴町を優先）の家族向け防災サイト。
バックエンド・ログイン・広告はありません。素の HTML/CSS/JS だけで動く静的サイトです。

## ページ

| ファイル | 内容 |
|---|---|
| `index.html` | トップ（緊急モード）。災害4ボタンと避難先への入口 |
| `shelters.html` | 避難先リスト（種別タブ・町名・キーワード。鶴町が先頭） |
| `quake.html` / `tsunami.html` / `fire.html` / `typhoon.html` | 災害ごとの「まずやること3つ」と近くの避難先 |
| `hazard.html` | 浸水想定のサマリーと公式ハザードマップへのリンク |
| `levels.html` | 警戒レベルの見方 |
| `stock.html` | 備蓄リスト・かんたん計算機（印刷可） |
| `contacts.html` | 緊急連絡先・171・うちの集合場所メモ（端末内だけに保存） |
| `sheet.html` | 冷蔵庫用 印刷シート（A4・1枚） |

共通ヘッダー・フッターは各HTMLに直接書いています。共通の見た目は `assets/site.css`、データ読み込みと施設の描画は `assets/site.js` にあります。

## 避難先データ（年1回の更新はここだけ）

避難先は **`data/shelters-taisho.json` の1ファイル** にまとめ、全ページがそこからJSで描画します。施設名はHTMLに書いていません。

大阪市は避難先を定期的に見直します。年1回をめどに、次の手順で更新します。

1. 公式ページを開き、最新の一覧と照らし合わせる。
   - 大正区「大正区内の避難場所・防災マップ」 https://www.city.osaka.lg.jp/taisho/page/0000385887.html
   - 大阪市「津波避難ビル・水害時避難ビルの確保について」（一覧表PDF・指定取消一覧） https://www.city.osaka.lg.jp/kikikanrishitsu/page/0000138173.html
2. `data/shelters-taisho.json` を編集する。
   - 追加された施設は `facilities` に足す。`id` は使っていない番号にする。既存の `id` は変えない（印刷シートの選択が端末に保存されているため）。
   - 指定が取り消された施設は削除し、`excludedNotes` に一言書く。
   - 照合した施設の `checkedDate`（と `detailCheckedDate`）を照合した日付にする。
   - 一覧の版が変わったら `listTitle` / `listAsOf` / `sources` の題名とURLも直す。
3. 検証する（Node.js が必要です）。

   ```bash
   node tools/validate-data.mjs
   ```

   出典URLか確認日が欠けた施設があると、エラーで終了します。
4. いつもの公開先にファイルを置き直す。

`sw.js` を変える必要はありません。避難先データは「通信できれば最新を取得」するので、各端末には次に開いたときに届きます。

### 施設1件の形

```json
{
  "id": "tb19",
  "name": "イケア鶴浜",
  "address": "鶴町2-24-55",
  "area": "鶴町",
  "types": ["tsunami"],
  "hours": "24時間",
  "capacity": 28000,
  "note": "",
  "sourceUrl": "https://www.city.osaka.lg.jp/taisho/page/0000385887.html",
  "checkedDate": "2026-11-12",
  "detailSourceUrl": "https://www.city.osaka.lg.jp/kikikanrishitsu/cmsfiles/contents/0000138/138173/tsunami.suigaiji_R080331.pdf",
  "detailCheckedDate": "2026-11-12"
}
```

- `types` に使える値：`shelter`（災害時避難所）、`tsunami`（津波避難ビル）、`temporary`（一時避難場所）、`wide`（広域避難場所）
- `address` は区名を除いた番地です。表示するときに `region.prefix`（大阪市大正区）を前に付けます。
- `hours` / `capacity` は公式資料にある値だけを書きます。ないときは `null` にすると「公式資料に記載なし」と表示されます。これらを書くときは、その出典（`detailSourceUrl` / `detailCheckedDate`）も必須です。
- `phone`（任意）は公式ページに載っている施設の代表番号です。
- `mapQuery`（任意）は Google マップの検索語です。番地で場所がうまく出ない施設に使います。
- `printDefaults` は、印刷シートに最初から入る3施設の `id` です。

### 出典がない施設を出さない仕組み（二重チェック）

1. **画面側**：`assets/site.js` の `isPublishable()` が、`sourceUrl`（https）と `checkedDate`（YYYY-MM-DD）がそろわない施設を表示から外します。時間・人数は、その出典がないと「公式資料に記載なし」になります。
2. **検証スクリプト**：`tools/validate-data.mjs` が同じ条件で調べ、1件でも欠けがあればエラーで終了します。

### 地域を増やすとき

`data/shelters-<地域>.json` を同じ形で作り、`data/regions.json` に1行足します。いまの画面は `default: true` の地域だけを表示します。

## オフライン対応（PWA）

- `sw.js` が、一度開いた端末に全ページ・CSS/JS・避難先データを保存します。トップを1回開けば、ほかのページも通信なしで開けます。
- ページ・CSS・JS は「保存済みをすぐ表示し、裏で更新」します。サイトを直したときは、次の次に開いたときに反映されます。
- `data/*.json` は「通信できれば最新、だめなら保存済み」です（待つのは最大3.5秒）。
- `manifest.webmanifest` と `icons/` で、ホーム画面に追加できます。
- Service Worker は https か localhost でしか動きません。

## 手元で見る

```bash
python3 -m http.server 8765
```

ブラウザで http://localhost:8765/ を開きます。`file://` で開くと、データ読み込みとオフライン機能が動きません。

## 公開

フォルダの中身をそのまま静的ホスティングに置けば公開できます（GitHub Pages、Netlify、Cloudflare Pages など）。パスはすべて相対なので、`https://example.github.io/bousai-pocket/` のようなサブパスでも動きます。https で配信してください（オフライン機能に必要です）。`tools/`・`README.md`・`.claude/` は公開しなくても動きます。

## 守っていること

- 避難施設は大阪市の公式情報だけを載せ、施設ごとに出典URLと確認日を付けています。
- 個人情報はコードにもデータにも含めていません。集合場所メモ・印刷シートの選択・備蓄のチェックは、各端末の localStorage にだけ保存します。サーバーには送りません。
- リアルタイムの警報・避難情報は表示せず、大阪防災アプリ・おおさか防災ネットに案内します。
- 浸水の深さは「区全体の最大値」であることと、想定の条件をセットで載せています。
