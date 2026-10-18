# ColorManager 実装計画書

- 作成日: 2026-10-18
- 対象環境: macOS、VSCode 1.141.0、Node.js 24
- 読み手: このリポジトリで実装を進める人（ユーザー本人と、作業を任された Claude）

## 1. この文書の目的

ColorManager は VSCode の配色を時刻に合わせて少しずつ変え、1日で色相を一周させる個人用の拡張機能である。実装に入ってから方針で迷わないように、この文書に決めたことと、その理由と、作業の順番をまとめる。数値は試作スクリプト（付録B）で全色相について確かめた値を載せている。

## 2. 要件

### 2.1 機能

- 1日を n 個の時間帯（スロット）に分け、スロットごとにメインの色相を決める。色相は1日で360°回り、23時台の終わりから0時へ切り替わるときも、ほかのスロットと同じ幅で進む。
- 明度と彩度は役割ごとに固定し、色相だけを変える。色域の都合で彩度を下げる場合も、色相に対してなめらかに下げ、境目を作らない。
- テーマに「Visual Studio Light」を選んでいるときだけ配色を適用する。Visual Studio Light の色は基準にせず、ColorManager の色ですべて置き換える。
- 時刻と色相の対応は2つのモードから選ぶ。既定は `normal`（0時に赤から始め、色相環の順に進む）で、もう一つは `sky`（空の色に寄せ、正午がアンバー、夕方がローズ、深夜が藍、明け方がティール）である。
- ワークベンチの色、シンタックスの色（TextMate と semantic token）、ターミナルの色を、メインの色相から決める。シンタックスの色もメインの色相と一緒に回す。
- 文字が読みにくくならないように調整する。ただし、ユーザーが素敵だと感じる配色を読みやすさより重く見る。少しの読みにくさは許容する。
- 背景は淡い色にするが、ほぼ白にはしない。色がはっきり分かる淡色で、長時間見ても疲れにくい強さにする。

### 2.2 最優先の要件

自動更新によって既存の VSCode 設定を壊さないことを、ほかのすべての要件より優先する。具体的には次の6つを守る。

1. ColorManager が書き換えるのは、`workbench.colorCustomizations`、`editor.tokenColorCustomizations`、`editor.semanticTokenColorCustomizations` の3つのキーの中の `"[Visual Studio Light]"` の値だけとする。ほかのキーと、3つのキーの中のほかのテーマの値は変えない（例外は、ユーザーが自分で選んだ操作で書く `colorManager.enabled` と `settingsSync.ignoredSettings` だけ）。
2. settings.json に構文エラーがあるときや、エディタで未保存の変更があるときは書き込まない。
3. 書き込む前に、settings.json のバイト列そのものをバックアップする。バックアップを取れない状況では書き込まない。
4. ユーザーが `"[Visual Studio Light]"` の値を手で編集したことを検出したら、上書きせずに止まって確認を求める。
5. いつでも1つのコマンドで、ColorManager を入れる前の状態に戻せる。
6. 安全のための確認が1つでも通らなかったら、書かずに終わる。「確認できないが書く」という分岐は作らない。

### 2.3 前提

- 現在の settings.json（`~/Library/Application Support/Code/User/settings.json`）は約205行の JSONC で、タブとスペースが混在し、末尾のカンマがある。3つのキーはまだ書かれていない。
- `workbench.colorTheme` は `"Visual Studio Light"` で、`window.autoDetectColorScheme` は設定されていない（既定値の false）。
- 対応するのは既定のプロファイルだけとする（9.5）。ほかのプロファイルが有効なときは書き込まない。
- `~/Library/Application Support/Code/User/sync` があるので、Settings Sync を使っている可能性がある。
- Visual Studio Light（`theme-defaults/themes/light_vs.json`）は、ワークベンチの色を48個、`tokenColors` の規則を49個（セレクタは104個で、そのうち5個は親スコープ付き）、`semanticTokenColors` を4個（`newOperator`、`stringLiteral`、`customLiteral`、`numberLiteral`）定義している。fontStyle を指定しているのは Markdown 用の7個のセレクタ（`emphasis`、`strong`、`markup.underline`、`markup.bold`、`markup.heading`、`markup.italic`、`markup.strikethrough`）だけである。

## 3. 決定事項の一覧

| 項目 | 決定 | 詳しい節 |
|---|---|---|
| 実行方式 | VSCode のプライベート拡張機能。VSIX でローカルに入れ、公開しない | 4 |
| 書き込みの手段 | `vscode.workspace.getConfiguration().update(..., ConfigurationTarget.Global)` だけを使う | 9 |
| 対応するプロファイル | 既定のプロファイルだけ | 9.5 |
| 色空間 | OKLCH | 6.1 |
| スロット数 n | 96（15分ごと、色相は1スロットで3.75°進む） | 6.2 |
| 時刻と色相 | `normal`（既定）と `sky` の2モード | 6.2 |
| 色の決め方 | アルゴリズムで生成し、鮮やかな文字色だけを12個のアンカーで補正する | 6.3 |
| 色域の扱い | クリップせず、明度と色相を保ったまま彩度だけをなめらかに下げる | 6.4 |
| 状態色（エラーなど） | 色相は固定し、アクセントと近づいたときは明度をずらして見分ける | 6.8 |
| コントラストの指標 | APCA で検査し、WCAG 2 の比も併記する | 6.10 |
| 上書きの範囲 | 元テーマ由来の色と、既定値がリテラルの色をすべて書く。派生色は ColorManager の色から自動で決まるので書かない。監査コマンドで漏れがないことを確かめる | 7 |
| 色 ID の一覧 | リポジトリにコミットした `data/color-registry.json` だけを使う。実行時の一覧では絞り込まない | 7.2 |
| 色の計算 | 依存ライブラリなしで TypeScript に実装する（約120行） | 6.12 |
| Settings Sync | 3つのキーを `settingsSync.ignoredSettings` に加えるよう、初回に確認を出す | 9.8 |

## 4. 実行方式の比較

| 観点 | 拡張機能（採用） | launchd の定期実行 | 常駐スクリプト |
|---|---|---|---|
| settings.json の扱い | VSCode 自身の設定編集機能が、対象のキーの値だけを置き換える。ほかの部分のコメントと書式は残る | jsonc-parser の `modify` で自前で編集する。構文エラーのある設定を編集したときの安全策を自分で作る必要がある | launchd と同じ |
| 構文エラーがあるとき | VSCode が書き込みを拒否する | 自分で検出しないと、壊れたファイルをさらに壊すおそれがある | 同左 |
| 未保存の編集があるとき | VSCode が書き込みを拒否する | エディタの未保存の内容が見えない。保存時に衝突のダイアログが出るか、どちらかの変更が消える | 同左 |
| 書き込みの衝突 | ファイルの更新日時（etag）を確かめ、ディスク側が新しければ書き込みを拒否する | 自前で作る必要がある | 同左 |
| 動く時間 | VSCode の起動中だけ。色が必要な時間と一致する | VSCode を閉じていても動く。意味のない書き込みが増える | 常に動き、メモリも使う |
| 導入と管理 | VSIX を入れるだけ | plist の管理が要る | プロセスの監視が要る |

拡張機能を採用する。VSCode の設定編集機能（`ConfigurationEditing`）が、構文エラーと未保存の編集と書き込みの衝突をすべて拒否するので、最優先の要件を VSCode の仕組みで守れる。

検討して採らなかった案がもう一つある。拡張機能が独自のテーマ（例「Visual Studio Light (rotating)」）を登録し、そのテーマの JSON ファイルを書き換える方式である。テーマの登録に非公開のオプション `"_watch": true` を付けると、VSCode はファイルの変更を読み直す。settings.json に1バイトも書かず、Settings Sync にも影響しない利点がある。一方で、`_watch` は非公式の機能で将来なくなるおそれがあり、ファイルを置き換えたときに変更として検出されるかも未確認である。何より「Visual Studio Light を選んだときだけ適用する」という要件と合わない。この案は、settings.json への書き込みに問題が出たときの代わりとして、15章に残す。

## 5. 全体構成

### 5.1 処理の流れ

```text
[VSCode 起動] → activate()
   ├─ 設定 colorManager.* を読む
   ├─ Scheduler: 60秒ごとに lastAppliedKey と現在のキーを比べる
   │     └─ スロットが変わった／テーマや設定が変わった／ウィンドウにフォーカスが戻った
   │           ↓
   ├─ timeToHue(現在時刻, mode, n) → H（メインの色相）
   ├─ generatePalette(H, options) → 役割ごとの色（OKLCH → sRGB の16進）
   ├─ buildPayload(palette) → 3つのキーに書く値
   │     ├─ workbench: 色 ID → 16進の色
   │     ├─ tokenColors: textMateRules
   │     └─ semantic: enabled と rules
   ├─ validatePayload() → 16進の形式、件数、透明が必須の色を検査
   └─ SettingsWriter.apply(payload)
         ├─ 前提の確認（有効、対象テーマ、既定のプロファイル、構文、未保存、コメント）
         ├─ 3つのキーすべての所有を確認（1つでも手で編集されていれば止まる）
         ├─ バックアップ
         └─ config.update() を3回 → 読み戻して一致を確かめる
```

色の計算（`color/` と `palette/`）は VSCode の API に依存しない純粋な関数にし、Node だけで単体テストできるようにする。`palette/` は `payload/` に依存しない（依存の向きは `color/` ← `palette/` ← `payload/` ← `settingsWriter.ts`）。VSCode の API を使うのは `extension.ts`、`scheduler.ts`、`settingsWriter.ts`、`backup.ts`、`themeGate.ts`、`dev/` だけにする。

### 5.2 ディレクトリ構成

```text
ColorManager/
├── .claude/skills/yomiyasu/      日本語の文書の推敲に使うスキル（コミットする）
├── .vscode/
│   ├── launch.json               開発用の起動設定（専用の user-data-dir を使う）
│   └── tasks.json
├── docs/
│   └── implementation-plan.md    この文書
├── research/palette-prototype/   配色の試作スクリプト（Python、付録B）
├── src/
│   ├── extension.ts              activate / deactivate、コマンドの登録
│   ├── scheduler.ts              スロットの計算と更新の契機
│   ├── themeGate.ts              Visual Studio Light が有効かを判定
│   ├── settingsWriter.ts         settings.json への安全な書き込み
│   ├── ownership.ts              所有の確認（ハッシュの記録）
│   ├── backup.ts                 バックアップと復元
│   ├── settingsFile.ts           settings.json の場所の特定と、本文の読み取り・解析
│   ├── config.ts                 colorManager.* の読み取り
│   ├── log.ts                    出力チャネル「ColorManager」
│   ├── color/
│   │   ├── oklab.ts              OKLab / OKLCH と sRGB の変換
│   │   ├── gamut.ts              最大彩度の計算となめらかな彩度の制限
│   │   ├── contrast.ts           WCAG 2 と APCA
│   │   ├── hex.ts                16進の出力と、半透明色のアルファの計算
│   │   └── catmullRom.ts         周期的な Catmull-Rom 補間
│   ├── palette/
│   │   ├── time.ts               timeToHue（normal / sky）
│   │   ├── roles.ts              役割の名前の一覧と UI の役割表
│   │   ├── tokens.ts             シンタックスの役割表
│   │   ├── anchors.ts            色相補正のアンカー表
│   │   ├── status.ts             状態色と衝突回避
│   │   ├── terminal.ts           ANSI 16色と括弧の色
│   │   ├── guard.ts              コントラストの検査と補正（PAIRS の一覧を持つ）
│   │   └── generate.ts           generatePalette(H, options)
│   ├── payload/
│   │   ├── workbenchMap.ts       色 ID → 役割の対応表
│   │   ├── textmate.ts           textMateRules の生成
│   │   ├── semantic.ts           semantic token の規則の生成
│   │   ├── build.ts              buildPayload
│   │   └── validate.ts           validatePayload
│   └── dev/
│       ├── generateThemeDump.ts  generateColorTheme の出力を読む共通処理
│       ├── dumpRegistry.ts       色 ID 一覧の取得（開発用コマンド）
│       └── auditCoverage.ts      上書き漏れの監査（開発用コマンド）
├── data/
│   ├── color-registry.json       色 ID、透明が必須か、VS Light での既定値の種類
│   ├── light-vs-selectors.json   light_vs.json のセレクタ104個と semantic のセレクタ4個、それぞれの役割
│   ├── coverage-report.json      監査の結果
│   └── coverage-allowlist.json   監査で漏れとして扱わない ID と理由
├── scripts/
│   ├── extract-light-vs.mjs      light_vs.json からセレクタを抜き出し、役割を割り当てる
│   └── preview.mjs               全スロットの見本 HTML を作る
├── test/
│   ├── unit/                     vitest（色の計算、ペイロード、書き込みの判断）
│   ├── integration/              @vscode/test-electron（隔離した user-data-dir で実行）
│   └── fixtures/                 癖のある settings.json の見本
├── package.json
├── tsconfig.json
├── esbuild.mjs
├── vitest.config.ts
├── .gitignore
├── CLAUDE.md                     作業の決まり（yomiyasu を通すことなど）
└── README.md
```

### 5.3 依存パッケージ

実行時の依存は `jsonc-parser` だけにする（settings.json の構文検査、コメントの検出、結合テストでの比較に使う）。開発時の依存は `typescript`、`esbuild`、`vitest`、`@types/vscode`、`@types/node`、`@vscode/vsce`、`@vscode/test-electron` とする。バージョンは実装を始めた時点の安定版に固定し、`package-lock.json` をコミットする。`@types/vscode` は `engines.vscode` 以下のバージョンにする。

`package.json` の主な項目は次のとおり。

```jsonc
{
  "name": "colormanager",
  "displayName": "ColorManager",
  "publisher": "local",
  "private": true,
  "version": "0.1.0",
  "engines": { "vscode": "^1.141.0" },
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "extensionKind": ["ui"],
  "capabilities": {
    "untrustedWorkspaces": { "supported": true },
    "virtualWorkspaces": true
  },
  "contributes": { "configuration": { /* 11章 */ }, "commands": [ /* 11章 */ ] },
  "scripts": {
    "build": "node esbuild.mjs",
    "test": "vitest run",
    "test:integration": "node test/integration/run.mjs",
    "preview": "node scripts/preview.mjs",
    "package": "vsce package --allow-missing-repository --skip-license"
  }
}
```

`extensionKind: ["ui"]` は、リモート接続のウィンドウでもローカルの settings.json に書くために付ける。`untrustedWorkspaces` を付けないと、制限モードのウィンドウで拡張機能が動かない。

## 6. 配色アルゴリズム

### 6.1 色空間

| 色空間 | 特徴 | 判断 |
|---|---|---|
| HSL | 明度を固定しても、青は暗く黄色は明るく見える | 採らない |
| OKLCH | 知覚的に均等。明度 L を固定すると、色相を変えても WCAG のコントラスト比の変動が約±7%に収まる | 採用 |
| OKHSL | 彩度を色域に対する割合で表す。彩度を固定すると、実際の彩度が色相によって0.09から0.29まで変わり、鮮やかさがそろわない | 採らない |
| HCT（CAM16） | トーンとコントラストの対応がよい。OKLCH の L でも同じ程度にそろうので、計算の重さに見合わない | 採らない |

OKLCH では明度を固定するとコントラストの変動は小さく、緑からティール（150〜190°）で少し低く、赤からマゼンタで少し高い。HSL と違って、青が暗くなる問題はない。問題になるのは、色相によって sRGB で出せる最大の彩度が大きく違うことである（6.4）。

### 6.2 時刻から色相を決める

スロット数は n = 96（15分ごと）にする。

| n | 間隔 | 隣のスロットとの色差 ΔE_OK の最大値（アクセント／ステータスバー／エディタ背景／キーワード） |
|---|---|---|
| 24 | 60分、15° | 0.035 / 0.030 / 0.0075 / 0.053 |
| 48 | 30分、7.5° | 0.018 / 0.016 / 0.0046 / 0.027 |
| 96 | 15分、3.75° | 0.010 / 0.009 / 0.0035 / 0.014 |
| 144 | 10分、2.5° | 0.008 / 0.007 / 0.0035 / 0.010 |
| 288 | 5分、1.25° | 0.005 / 0.005 / 0.0033 / 0.005 |

並べて比べたときに違いが分かる目安は ΔE_OK で約0.02である。n = 96 なら、すべての役割でこの目安を下回る。並べる相手のない時間の変化はさらに気づきにくいので、更新の瞬間はほとんど分からない。n = 48 では、アンカー補正で色相の進み方が局所的に速くなる（傾きが最大1.8）ため、シンタックスの色が目安を超える。n = 144 以上にしても見た目は変わらず、settings.json の書き込みと色の再読み込みが増えるだけである。エディタ背景の値が0.0033付近で下げ止まるのは、16進の8ビットへの丸めの誤差である。

色の計算そのものは n に依存しない連続な関数なので、n を変えても調整の手間は増えない。設定 `colorManager.slotsPerDay` で 24、48、96、144 から選べるようにし、既定値を96にする。

スロット番号と色相は次の式で決める。時刻は端末のローカル時刻を使う。

```text
minutesOfDay = (hours * 60 + minutes + timeOffsetMinutes) mod 1440
k = floor(minutesOfDay / (1440 / n))        // 0 .. n-1
step = 360 / n

normal: H = (29.234 + step * k) mod 360     // 0時が赤（#ff0000 の OKLCH の色相が 29.234°）、色相が増える向き
sky:    H = (260    - step * k) mod 360     // 正午が80°（アンバー）、色相が減る向き
pinnedHue が数値なら、上の計算をせずに H = pinnedHue mod 360
```

3時間ごとの例（エディタ背景、サイドバー、アクティビティバー、アクセント、ステータスバー）は次のとおり。

| 時刻 | normal の H | normal の色 | sky の H | sky の色 |
|---|---|---|---|---|
| 00:00 | 29.2 | #fdece9 #fce3df #f9d9d3 #ad4d40 #98483d | 260.0 | #e9f1fd #dfeafc #d3e2fa #406db9 #3d62a1 |
| 03:00 | 74.2 | #f9eee1 #f6e7d4 #f2dec5 #936417 #835a18 | 215.0 | #e1f4f9 #d4eff6 #c5e9f2 #127c90 #126f81 |
| 06:00 | 119.2 | #eef3e2 #e7edd7 #dee6c8 #68771e #5d6b20 | 170.0 | #e3f5ee #d7f0e6 #c8eadd #178166 #19745b |
| 09:00 | 164.2 | #e3f5ec #d8f0e4 #caeada #1c825e #1d7455 | 125.0 | #edf3e3 #e5edd8 #dbe6ca #5f7a23 #566d24 |
| 12:00 | 209.2 | #e0f5f8 #d4f0f4 #c4e9f0 #117d8b #11707c | 80.0 | #f8efe0 #f4e8d4 #f0dfc4 #8e6716 #7f5c17 |
| 15:00 | 254.2 | #e8f1fd #deebfc #d1e3fa #3570b6 #34659f | 35.0 | #fdece7 #fbe3dd #f9d9d1 #ac4f38 #974936 |
| 18:00 | 299.2 | #f2edfc #ece6fa #e4dcf8 #7a5baf #6d5399 | 350.0 | #fcebf2 #fae2ec #f7d7e5 #a44b79 #90466c |
| 21:00 | 344.2 | #fbebf4 #f9e2ee #f5d7e8 #a14c81 #8e4772 | 305.0 | #f3edfc #eee5fa #e7dbf7 #8058aa #725195 |

それぞれのモードで気をつける時間帯がある。

- `normal` では、10:15〜13:00 にシアンの帯（165〜225°）を通る。この帯は出せる彩度が小さく、アクセントの彩度が0.088まで下がるので、少し落ち着いた色になる。
- `sky` では、09:30〜11:30 に黄色の帯（95〜115°）を通る。明度の低い黄色はオリーブ色になりやすいので、6.7 のアンカー補正が最も効く時間帯である。作業時間と重なるので、調整のときはこの時間帯を重点的に見る。

`sky` で深夜を藍（約275°）に寄せたい場合は、開始の色相をずらすと正午が黄色の帯に入ってしまう。その場合は、時刻から色相への写像を単調でなめらかな不等間隔の写像に変える。これは最初の実装には入れず、15章に残す。

### 6.3 プリセットとアルゴリズムの比較

| 方式 | 長所 | 短所 |
|---|---|---|
| 全スロットのプリセット | 1枚ずつ思いどおりに作れる | 96スロット × 数百の色 ID で数万の値になり、手で保守できない。隣のスロットとのつながりも保証できない |
| アルゴリズムだけ | 値が少なく、全色相でつながりを保証できる | 色相によっては見栄えが悪い（低い明度の黄色がオリーブ色になる、ティールが灰色っぽくなる） |
| アルゴリズム＋アンカー補正（採用） | アルゴリズムの保証を保ったまま、気になる色相だけを手で直せる | 補正によって色どうしの差が変わるので、全スロットでの検証が必須になる |

採用する方式では役割ごとの L、C と色相のずれ（オフセット）をアルゴリズムの基本値とし、鮮やかな文字色のグループ（6.6 のグループ列が `vivid` の役割）だけに、絶対色相30°ごとの12個のアンカーで ΔL と Δh の補正をかける（6.7）。背景などの淡い面は 6.4 の制限の内側に収まっているので補正は要らない。

### 6.4 色域への収め方

sRGB で出せる最大の彩度は、明度と色相によって次のように変わる（色相0.25°刻みで計算した、全色相の中の最小値）。

| L | 全色相で出せる彩度の上限 | 上限を決めている色相 |
|---|---|---|
| 0.45 | 0.077 | 200°（シアン）、次に90°（黄）が0.092 |
| 0.50 | 0.085 | 200° |
| 0.55 | 0.094 | 200° |
| 0.80 | 0.100 | 268°（青） |
| 0.88 | 0.058 | 268° |
| 0.91 | 0.043 | 268° |
| 0.935 | 0.031 | 268° |
| 0.955 | 0.021 | 268° |
| 0.97 | 0.014 | 268° |

文字色の明度（0.45〜0.6）ではシアンと黄色が、淡い面の明度（0.8以上）では青と赤が上限を決める。L = 0.5 で彩度を全色相で一定にすると C = 0.085 が上限になり、地味すぎる。そこで、役割の彩度が上限を超える色相でだけ、次の式でなめらかに彩度を下げる。

```text
maxC(L, h) = sRGB に収まる最大の彩度（C を 0〜0.4 の範囲で40回二分探索して求める）
softC(L, C, h) = (C^-6 + (0.98 * maxC(L, h))^-6)^(-1/6)
```

`softC` は常に `0.98 * maxC` 以下で、色相に対して連続かつなめらかなので、一周しても境目ができない。sRGB の各チャンネルを0〜1に切り詰める（クリップする）方式は使わない。クリップすると色相が最大6.4°ずれ、時間とともに色が揺れて見えるからである。

### 6.5 UI の役割表

`src/palette/roles.ts` に、役割の名前（`RoleName` 型）と値を次の表のとおりに定義する。7章の対応表と 6.10 の PAIRS は、この表と 6.6、6.8、6.9 の名前だけを使う。色相は `H + オフセット` で、C の括弧内は `softC` を通したあとの範囲を示す。

| 役割の名前 | L | C | オフセット | 備考 |
|---|---|---|---|---|
| `editor.bg` | 0.955 | 0.022（0.019〜0.022） | 0 | エディタ、パネル、アクティブなタブ。はっきり色づいた淡色 |
| `sideBar.bg` | 0.935 | 0.030（0.027〜0.030） | 0 | サイドバー、非アクティブなタブ。エディタより1段濃い |
| `tabs.strip` | 0.928 | 0.032 | 0 | タブの並ぶ帯 |
| `titleBar.bg` | 0.922 | 0.034 | 0 | |
| `activityBar.bg` | 0.910 | 0.040（0.037〜0.040） | 0 | 面の中で最も濃い |
| `widget.bg` | 0.975 | 0.012 | 0 | ホバー、候補一覧、メニュー |
| `widget.shadow` | 0.300 | 0.020 | 0 | アルファ 0x29（0.16） |
| `input.bg` | 0.985 | 0.008 | 0 | |
| `border` | 0.860 | 0.030 | 0 | パネル、サイドバー、タブの境界 |
| `border.strong` | 0.780 | 0.040 | 0 | 入力欄の枠など |
| `lineHighlight` | 0.935 | 0.030 | 0 | |
| `list.hover` | 0.915 | 0.036 | 0 | |
| `list.activeSelection` | 0.865 | 0.060（0.055〜0.060） | 0 | 上の文字は `fg.primary`（8.9:1） |
| `list.inactiveSelection` | 0.895 | 0.040 | 0 | |
| `sel.editor` | 0.875 | 0.060（0.053〜0.060） | 0 | 6.11 の方法で半透明にする |
| `sel.editor.inactive` | 0.900 | 0.040 | 0 | 半透明 |
| `selHighlight` | 0.900 | 0.045 | 0 | 半透明 |
| `wordHighlight` | 0.910 | 0.040 | 0 | 半透明 |
| `find.current` | 0.820 | 0.110（0.084〜0.110） | +120 | 選択範囲と必ず違う色になる |
| `find.other` | 0.885 | 0.070 | +120 | 半透明 |
| `indentGuide` / `indentGuide.active` | 0.880 / 0.740 | 0.020 / 0.040 | 0 | |
| `scrollbar` / `scrollbar.active` | 0.800 / 0.680 | 0.020 / 0.080 | 0 | アルファ 0x80（0.5） |
| `lineNumber` / `lineNumber.active` | 0.660 / 0.420 | 0.030 / 0.050 | 0 | |
| `fg.primary` | 0.300 | 0.025 | 0 | UI の文字。色相を帯びた黒 |
| `editor.fg` | 0.280 | 0.025 | 0 | |
| `fg.secondary` | 0.470 | 0.030 | 0 | 説明文 |
| `fg.disabled` | 0.660 | 0.020 | 0 | |
| `accent` | 0.540 | 0.130（0.088〜0.130） | 0 | ボタン、バッジ、進捗バー、アクティブタブの上の線。白文字は4.77〜5.45:1 |
| `accent.hover` | 0.490 | 0.130 | 0 | |
| `textLink` | 0.490 | 0.130 | 0 | |
| `cursor` | 0.490 | 0.150 | 0 | |
| `focus` | 0.580 | 0.130 | 0 | focusBorder。背景に対して3.56:1 |
| `statusBar.bg` | 0.500 | 0.110（0.081〜0.110） | 0 | 濃いアクセントの帯。白文字は5.68〜6.40:1 |
| `statusBar.alt` | 0.500 | 0.110 | +180 | デバッグ中、フォルダなし。補色なので常にいちばん見分けやすい |
| `button.secondary` | 0.880 | 0.040 | 0 | |
| `onAccent` | 固定 | | | `#ffffff`。`accent`、`statusBar.bg`、`statusBar.alt` の上の文字 |

ステータスバーは濃いアクセントの帯にする。時刻による色の変化がいちばん分かりやすい場所で、白文字のコントラストも5.7:1以上を保てる。

面の濃さは設定 `colorManager.tint`（既定1.0、範囲0.75〜1.2）で調整できるようにする。この値を淡い面（L ≥ 0.86 の役割）の C に掛ける。`softC` を通すので色域から出ることはないが、`editor.bg` は1.0でも青の色相で上限に当たって0.019に抑えられている。1.2より上にすると、青とほかの色相の濃さの差が目立つので許さない。

全360°で、すべての役割が sRGB に収まることを確かめた。UI の文字の組み合わせのうち、全色相で最も条件の悪い値は次のとおり。

| 組み合わせ | WCAG | APCA Lc |
|---|---|---|
| editor.fg / editor.bg | 12.7 | 91.8 |
| fg.primary / activityBar.bg | 10.3 | 81.6 |
| fg.secondary / sideBar.bg | 5.56 | 70.2 |
| textLink / editor.bg | 5.23 | 70.7 |
| editor.fg / sel.editor | 9.83 | 76.0 |
| editor.fg / find.current | 7.90 | 64.9 |
| lineNumber / editor.bg | 2.69 | 48.8 |
| fg.disabled / sideBar.bg | 2.55 | 44.6 |

行番号と無効な項目の文字は、目立たせないためにわざと低くしている。

### 6.6 シンタックスの役割表

| 役割の名前 | L | C | オフセット | 書式 | グループ |
|---|---|---|---|---|---|
| `tok.keyword` | 0.490 | 0.150 | 0 | | vivid |
| `tok.storage` | 0.420 | 0.110 | +20 | | vivid |
| `tok.function` | 0.490 | 0.130 | −60 | | vivid |
| `tok.type` | 0.490 | 0.110 | −120 | | vivid |
| `tok.string` | 0.515 | 0.120 | 180 | | vivid |
| `tok.number` | 0.490 | 0.130 | +120 | | vivid |
| `tok.parameter` | 0.450 | 0.080 | +60 | italic | vivid |
| `tok.regexp` | 0.450 | 0.110 | +150 | | vivid |
| `tok.property` | 0.420 | 0.050 | −120 | | |
| `tok.variable` | 0.280 | 0.025 | 0 | | |
| `tok.comment` | 0.620 | 0.035 | 0 | italic | |
| `tok.operator` | 0.400 | 0.020 | 0 | | |

次の役割は上の色を別の書式で使う別名である。

| 役割の名前 | 使う色 | 書式 |
|---|---|---|
| `tok.tag` | `tok.keyword` | |
| `tok.attribute` | `tok.type` | |
| `tok.escape` | `tok.number` | bold |
| `tok.decorator` | `tok.function` | italic |
| `md.heading` | `tok.keyword` | bold |
| `md.bold` | `editor.fg` | bold |
| `md.italic` | `editor.fg` | italic |
| `md.link` | `textLink` | underline |
| `md.strike` | `fg.secondary` | strikethrough |
| `md.quote` | `tok.comment` | |
| `diff.inserted` / `diff.deleted` / `diff.changed` / `diff.header` | `status.success` / `status.error` / `status.warning` / `status.info` | |
| `fg` | `editor.fg` | |

decorator に独自の色（L 0.53、C 0.10、−30）を使うと keyword との色差が最小0.039まで下がり、attribute に独自の色（L 0.47、C 0.11、+60）を使うと parameter との色差が0.019しかないので、どちらも別名にした。

背景（editor.bg）に対するコントラストの全96スロットでの最小値は次のとおり。

| 役割 | 補正なし（WCAG / APCA） | アンカー補正あり（WCAG / APCA） |
|---|---|---|
| keyword | 5.21 / 70.6 | 4.70 / 67.5 |
| storage | 7.07 / 78.8 | 6.31 / 75.7 |
| function | 5.23 / 70.4 | 4.75 / 68.0 |
| type | 5.18 / 70.0 | 4.74 / 68.1 |
| string | 4.63 / 66.6 | 4.24 / 64.4（黄色の帯） |
| number | 5.15 / 69.7 | 4.67 / 67.0 |
| parameter | 6.27 / 75.7 | 5.51 / 72.0 |
| property | 7.14 / 78.8 | 7.14 / 78.8 |
| regexp | 6.14 / 74.6 | 5.52 / 72.0 |
| operator | 8.00 / 81.8 | 8.00 / 81.8 |
| variable | 12.7 / 91.8 | 12.7 / 91.8 |
| comment | 3.16 / 54.7 | 3.16 / 54.7 |

選択範囲の上では string が3.3以上、そのほかが3.6以上、行のハイライトの上では4.0以上を保つ。アンカー補正の90°ではオリーブ色ではなく金色の黄にするために明度を上げており、黄色の帯でコントラストが約0.4下がる。読みやすさを優先したくなったら、90°の ΔL を0にすれば4.6以上に戻る。

役割どうしの色差（ΔE_OK）の全スロットでの最小値は、主要な5つ（keyword、function、type、string、number）の組み合わせで0.078以上ある。差が小さい組み合わせは number と regexp（0.043）、storage と operator（0.048、彩度の差で見分けられる）、type と property（0.053）である。number と regexp は隣り合うことが少ないので許容する。

### 6.7 色相補正（アンカー）

補正をかけるのは、6.6 のグループ列が `vivid` の8つの役割だけである。別名の役割は元の色の補正をそのまま受け継ぐ。UI の役割、状態色、ANSI の色、括弧の色には補正をかけない。アンカーは絶対色相30°ごとの12個で、周期的な Catmull-Rom 補間で間をつなぐ（一次微分まで連続）。

| 絶対色相 | ΔL | Δh |
|---|---|---|
| 0° | 0 | 0 |
| 30° | 0 | 0 |
| 60° | +0.010 | −4 |
| 90° | +0.040 | −12 |
| 120° | 0 | +6 |
| 150° | −0.010 | +2 |
| 180° | −0.020 | −5 |
| 210° | −0.020 | +5 |
| 240° | 0 | 0 |
| 270° | +0.010 | 0 |
| 300° | 0 | 0 |
| 330° | 0 | 0 |

90°付近の Δh は入力の色相97〜114°を出力88〜118°に広げ、オリーブ色の帯を約1.7倍の速さで通り過ぎるようにする。90°の ΔL は黄色を金色に寄せる（#79600a → #946811）。180°と210°の補正はティールを少し深く濃い色にする。この補正で、オリーブ色の帯に入る（役割、スロット）の組は864組中95組から65組に減った。

補正には3つの決まりを設ける。

1. 補正後の色相が入力の色相に対して単調に増えるように、`1 + d(Δh)/dh > 0` を保つ（今の表では、補正後の色相の傾きは0.59〜1.8）。
2. 補正は絶対色相で決まるので、役割どうしのオフセットの差が変わる。表を変えたら、12章の検証（コントラストと色差の下限）を必ず通す。
3. C の補正は下げる向き（ΔC ≤ 0）だけを許す。上げる向きは `softC` に任せる。今の表には C の補正はない。

### 6.8 状態色と衝突回避

エラーの赤のように意味が定着した色は、メインの色相と一緒に回さず、絶対色相を固定する。

| 役割の名前 | L | C | h | 16進 | 背景との比 |
|---|---|---|---|---|---|
| `status.error` | 0.55 | 0.19 | 27 | #c53732 | 4.60 |
| `status.warning` | 0.64 | 0.14 | 70 | #bb7d29 | 3.00 |
| `status.info` | 0.55 | 0.14 | 250 | #2a75ba | 4.19 |
| `status.success` | 0.58 | 0.15 | 145 | #388f40 | 3.53 |
| `diff.insertedBg` | 0.90 | 0.05 | 145 | | 半透明 |
| `diff.removedBg` | 0.90 | 0.05 | 27 | | 半透明 |

Git の追加は `status.success`、削除は `status.error`、変更は `status.warning` を使う。

アクセントは1日で一周するので、どこかの時刻で必ず状態色と同じ色相になる。色相を遠ざける補正は、アクセントが状態色を追い越すときに向きが反転して境目になる。そこで、色相ではなく明度をずらして見分ける。

```text
d = アクセントの色相と状態色の色相の角度差（0〜180°）
w = d < 40 ? cos²(π d / 80) : 0
L_status = L + dir * amp * w

error:   dir -1, amp 0.10
info:    dir -1, amp 0.10
warning: dir +1, amp 0.06
success: dir +1, amp 0.06
```

この補正で、アクセントとの色差の最小値は error 0.079、warning 0.124、success 0.084、info 0.058 になる。info とアクセントの青はもともと同じ系統の色なので、これ以上は離さない。波線やアイコンの形でも見分けられる。差分の背景にはこの補正をかけない。

状態は表すが意味の決まった色ではないもの（デバッグ中のステータスバー、フォルダなし）は、補色の `statusBar.alt` を使う。

### 6.9 ターミナルの ANSI 色と括弧の色

ANSI の16色はプログラムが「赤はエラー」のような意味で使うので、黒と白の系統を除いて絶対色相を固定する。黒と白の系統はメインの色相を帯びた灰色にする。淡い背景のターミナルでは、多くのプログラムが「白」を通常の文字色として使うので、VSCode の淡色テーマ用の既定値と同じく、白を中間の灰色にする（既定値は ansiWhite #555555、ansiBrightBlack #666666、ansiBrightWhite #a5a5a5）。bright 系の色も、VSCode の既定値にならって通常の色より明るくする。

| 役割の名前 | L | C | h |
|---|---|---|---|
| `ansi.black` | 0.300 | 0.025 | H |
| `ansi.red` | 0.550 | 0.170 | 27 |
| `ansi.green` | 0.560 | 0.140 | 145 |
| `ansi.yellow` | 0.620 | 0.130 | 85 |
| `ansi.blue` | 0.520 | 0.140 | 255 |
| `ansi.magenta` | 0.530 | 0.150 | 330 |
| `ansi.cyan` | 0.560 | 0.090 | 200 |
| `ansi.white` | 0.480 | 0.020 | H |
| `ansi.brightBlack` | 0.550 | 0.020 | H |
| `ansi.brightRed` 〜 `ansi.brightCyan` | 対応する色の L +0.04、C +0.02（`softC` を通す） | | 同じ |
| `ansi.brightWhite` | 0.700 | 0.015 | H |

この表の値は試作で検証していないので、フェーズ2（13章）で 6.10 の検査にかけてから確定する。

括弧の色（`bracket.1`〜`bracket.6`）は、L 0.50、C 0.12 で、オフセット 0、+60、+120、+180、+240、+300 の6色にし、メインの色相と一緒に回す。

### 6.10 コントラストの保証

検査には APCA（0.0.98G-4g）を使い、WCAG 2 の比も併記する。APCA は文字と背景の明暗の向きを区別し、淡い背景の上の中間の明るさの文字の見え方を WCAG 2 より正しく表す。

コントラストの補正（guard）をかける組み合わせ（PAIRS）は、`src/palette/guard.ts` に次の一覧として書く。7章の対応表からの自動登録はしない（`palette/` が `payload/` に依存しないようにするため）。

| 文字の役割 | 背景の役割 | APCA Lc の下限 |
|---|---|---|
| `editor.fg` | `editor.bg`、`lineHighlight` | 75 |
| `fg.primary` | `editor.bg`、`sideBar.bg`、`activityBar.bg`、`titleBar.bg`、`widget.bg` | 75 |
| `fg.primary` | `list.activeSelection` | 60 |
| `editor.fg` | `sel.editor`（重ねたあとの色）、`find.current` | 60 |
| `fg.secondary` | `sideBar.bg`、`editor.bg` | 60 |
| `textLink` | `editor.bg` | 60 |
| `onAccent` | `accent`、`statusBar.bg`、`statusBar.alt` | 60 |
| `vivid` の8役割、`tok.property`、`tok.operator`、`tok.variable` | `editor.bg` | 60 |
| `tok.comment` | `editor.bg` | 45 |
| `lineNumber` | `editor.bg` | 40 |

guard は生成の最後に1回だけかける。下限を下回った組み合わせについて、文字色の L を最大0.15の範囲で二分探索して下限を満たす値にし、もう一度 `softC` を通す。`onAccent` の組み合わせでは文字（白）ではなく背景の L を下げる。

guard は安全網であり、既定の表では一度も働かない（試作で確認済み）。guard が働いた場合は表の設計の誤りなので、単体テストで「全スロット・両モードで guard の補正回数が0」を検査する。guard が働くとその色相でなめらかさが崩れるので、表のほうを直す。シンタックスの色を選択範囲の上に置いたときのコントラスト（WCAG で3.3前後）は PAIRS に入れず、12.1 の単体テストで WCAG 3.0 以上であることだけを確かめる。

### 6.11 半透明色の出し方

VSCode には、下にある装飾を隠さないように透明でなければならない色がある（色 ID の一覧の取得方法は 7.2）。こうした色と、選択範囲などの重なる色は、目標の見た目の色 T を先に OKLCH で決め、背景 B の上に重ねたときに T になるようにアルファ α と元の色 S を求める。

```text
B = 色 ID の対応表で指定した背景の役割（指定がなければ editor.bg）
    sideBar、list、tree で始まる ID は sideBar.bg、panel と terminal で始まる ID は editor.bg
α を 1/255 単位に丸めてから S = B + (T - B) / α を計算する   // sRGB のガンマ補正後の値でチャンネルごとに計算
S が 0〜1 を外れたら、α を 0.05 ずつ上げて計算し直す（上限 0.9）
0.9 でも外れたら S を 0〜1 に切り詰め、出力チャネルに記録する（単体テストでは切り詰めが0回であることを検査する）
出力は #rrggbbaa
```

α の初期値は役割ごとに決める。`selHighlight`、`wordHighlight`、`find.other` は0.5、`diff.insertedBg` と `diff.removedBg` は0.35、そのほかの透明が必須の色は0.5にする。

### 6.12 生成関数の手順

色の計算は依存ライブラリを使わずに TypeScript で書く。OKLab の行列、最大彩度の二分探索、`softC`、WCAG、APCA を合わせて約120行で、決定的に動き、単体テストもしやすい。行列と APCA の係数は付録Bの `ok.py` と同じ値を使う。

```ts
function timeToHue(date: Date, opt: { mode: 'normal' | 'sky'; n: number; timeOffsetMinutes: number; pinnedHue: number | null }): number

function generatePalette(H: number, opt: { tint: number }): Palette {
  // 1. 面 → 重ねる色 → 文字 → シンタックス → 帯 の順に役割を計算する
  for (const role of ROLES) {
    let h = wrap(H + role.offset), L = role.L, C = role.C * (role.L >= 0.86 ? opt.tint : 1);
    if (role.group === 'vivid') {
      L += catmullRom(ANCHORS.dL, h);
      h = wrap(h + catmullRom(ANCHORS.dh, h));
    }
    C = softC(L, C, h);
    out[role.name] = { L, C, h };
  }
  // 2. 別名の役割を元の役割からコピーし、書式を付ける
  // 3. 状態色: 色相は固定し、アクセントとの角度差で明度をずらす
  // 4. ANSI と括弧の色
  // 5. guard: PAIRS の下限を下回る組み合わせだけ L を補正し、補正の記録を返す
  return { colors: out, guardAdjustments };
}

function toHex(palette: Palette): HexPalette   // 不透明は #rrggbb、半透明は 6.11 の方法で #rrggbbaa
```

## 7. VSCode の色 ID への割り当て

### 7.1 上書きの範囲

要件は「Visual Studio Light の色を基準にせず、すべての色を ColorManager の色にする」ことである。これを、VSCode に登録された全色 ID（本体だけで数百個）をそのまま書く方法では実現しない。次の3つの理由がある。

1. 既定値が null の色がある（`contrastBorder` など）。null は「線を引かない」という意味なので、値を入れると至る所に枠線が出る。
2. 透明でなければならない色が多くある。不透明な値を書くと、選択範囲や検索結果、差分の表示を隠してしまう。
3. VSCode の色の多くは、ほかの色から派生する（例 `transparent(focusBorder, 0.6)`）。元になる色を ColorManager が決めれば、派生する色は自動的に ColorManager の色になる。派生する色まで固定値で書くと、この関係が切れ、settings.json も1,500行ほど増える。

そこで、次の色をすべて書く。

- (A) light_vs.json が定義している48個の色。
- (B) Visual Studio Light での既定値がリテラルの色（ほかの色から派生しない色）。
- (C) 派生する色のうち、デザインとして値を指定したい色（選択範囲、検索の一致など）。

書いた結果として「どの色 ID の実際の色も、ColorManager の色か、その派生か、null か、完全な透明のどれかになっている」ことを、7.4 の監査で確かめる。これで、Visual Studio Light の色が1つも残らないことを保証する。書く数は200〜300個の見込みである。

### 7.2 色 ID の一覧の取得

開発用コマンド `ColorManager (dev): Dump Color Registry` で、色 ID の一覧を `data/color-registry.json` に書き出してコミットする。このコマンドは隔離した開発環境（13章）で、テーマを Visual Studio Light にし、ColorManager の書き込みを止めた状態で実行する。

1. スキーマを読む。

   ```ts
   const raw = await vscode.workspace.fs.readFile(vscode.Uri.parse('vscode://schemas/workbench-colors'));
   const schema = JSON.parse(Buffer.from(raw).toString('utf8'));
   ```

   - `schema.properties` のキーが色 ID である。`$ref` と `$defs` で重複部分がまとめられているので、参照を解決して読む。
   - 透明が必須の色は、`oneOf[0].pattern` があるもの（`needsTransparency = !!oneOf[0].pattern`）とする。`patternErrorMessage` は表示言語で翻訳されるので、文字列では判定しない。
   - `deprecationMessage` がある色は書き出さない。

2. `workbench.action.generateColorTheme` を実行し、出力から Visual Studio Light での既定値の種類を調べる（読み方は 7.5）。設定された色（`"id": "#値"`）は `"theme"`、`//"id": null` は `"null"`、`//"id": "#値"` は値そのものを `vsLightDefault` として記録する。値として記録した色はリテラルか派生かをこの出力だけでは区別できないので、7.4 の監査で判定する。

出力の形は次のとおり。

```json
{
  "vscodeVersion": "1.141.0",
  "generatedAt": "2026-10-xxTxx:xx:xx+09:00",
  "colors": {
    "editor.background": { "needsTransparency": false, "vsLightDefault": "theme" },
    "contrastBorder": { "needsTransparency": false, "vsLightDefault": "null" },
    "editor.selectionHighlightBackground": { "needsTransparency": true, "vsLightDefault": "theme" }
  }
}
```

この一覧には、インストールしている拡張機能が登録した色も含まれる。VSCode を更新したときと、色を登録する拡張機能を入れたり外したりしたときに、このコマンドと 7.4 の監査を実行し直す。

実行時にはこの一覧に載っている ID だけを書く。実行時の色 ID の一覧で絞り込むことはしない。拡張機能はワークスペースごとに無効にできるので、ウィンドウによって書く値が変わり、ほかのウィンドウから手で編集されたように見えてしまうからである。外した拡張機能の色 ID が残っても、settings.json に「不明な色」の警告が出るだけで、動作には影響しない。

### 7.3 割り当て規則

`src/payload/workbenchMap.ts` に、色 ID と役割の対応を、上から順に評価する規則として書く。

```ts
type Rule = {
  match: string | RegExp;
  role: RoleName | ((id: string) => RoleName);
  alpha?: number;         // 透明が必須の色、または意図して半透明にする色の α の初期値
  over?: RoleName;        // 6.11 で重ねる背景（省略時は 6.11 の既定）
};

export const WORKBENCH_RULES: Rule[] = [
  // 完全一致（優先）
  { match: 'editor.background', role: 'editor.bg' },
  { match: 'editor.foreground', role: 'editor.fg' },
  { match: 'foreground', role: 'fg.primary' },
  { match: 'statusBar.background', role: 'statusBar.bg' },
  { match: 'statusBar.foreground', role: 'onAccent' },
  { match: 'statusBar.debuggingBackground', role: 'statusBar.alt' },
  { match: 'statusBar.noFolderBackground', role: 'statusBar.alt' },
  { match: 'activityBar.background', role: 'activityBar.bg' },
  { match: 'activityBarBadge.background', role: 'accent' },
  { match: 'activityBarBadge.foreground', role: 'onAccent' },
  { match: 'sideBar.background', role: 'sideBar.bg' },
  { match: 'titleBar.activeBackground', role: 'titleBar.bg' },
  { match: 'editorGroupHeader.tabsBackground', role: 'tabs.strip' },
  { match: 'tab.activeBackground', role: 'editor.bg' },
  { match: 'tab.inactiveBackground', role: 'sideBar.bg' },
  { match: 'tab.activeBorderTop', role: 'accent' },
  { match: 'focusBorder', role: 'focus' },
  { match: 'widget.shadow', role: 'widget.shadow' },
  { match: 'editorCursor.foreground', role: 'cursor' },
  { match: 'editor.selectionBackground', role: 'sel.editor', alpha: 0.6 },
  { match: 'editor.findMatchBackground', role: 'find.current' },
  { match: 'editorError.foreground', role: 'status.error' },
  { match: 'gitDecoration.addedResourceForeground', role: 'status.success' },
  { match: /^terminal\.ansi(Bright)?(Black|Red|Green|Yellow|Blue|Magenta|Cyan|White)$/, role: ansiRole },
  { match: /^editorBracketHighlight\.foreground[1-6]$/, role: bracketRole },
  { match: /^symbolIcon\.(\w+)Foreground$/, role: symbolIconRole },
  // ……（フェーズ4で、(A)(B)(C) のすべての ID を並べる）

  // 末尾の規則（7.4 の監査で漏れた ID の受け皿）。vsLightDefault が "null" の ID には当てない
  { match: /Border$/, role: 'border' },
  { match: /Background$/, role: 'widget.bg' },
  { match: /Foreground$/, role: 'fg.primary' },
];
```

関数の規則は次のとおりに決める。

- `ansiRole(id)`: `terminal.ansiBrightRed` → `ansi.brightRed` のように、ID の後半を 6.9 の役割の名前に変える。
- `bracketRole(id)`: `editorBracketHighlight.foregroundN` → `bracket.N`。
- `symbolIconRole(id)`: 次の表で決め、表にない種類は `fg.secondary` にする。

  | symbolIcon の種類 | 役割 |
  |---|---|
  | function、method、constructor、event | `tok.function` |
  | class、interface、struct、typeParameter、namespace、module、package | `tok.type` |
  | variable、field、property、key | `tok.property` |
  | constant、number、boolean、enumMember、null | `tok.number` |
  | string | `tok.string` |
  | keyword、operator | `tok.keyword` |
  | enum | `tok.type` |

そのほかの決まりは次のとおり。

- 透明が必須の色（`needsTransparency: true`）には、規則で `alpha` を指定していなくても、6.11 の方法で α 0.5 から始めてアルファを付ける。
- 規則に当たらない ID は書かない。7.4 の監査で漏れとして見つける。

### 7.4 上書き漏れの監査

開発用コマンド `ColorManager (dev): Audit Coverage` で、Visual Studio Light の色が残っていないかを調べる。このコマンドは隔離した開発環境（専用の user-data-dir）でだけ実行する。

1. ColorManager の色を色相 H1 = 0 で適用し、`workbench.action.generateColorTheme` の出力を読む（7.5）。
2. 色相を H2 = 180 に変えて、同じことをする。
3. 次のすべてに当てはまる ID を「漏れ」とする。
   - ColorManager が書いた ID ではない（`onAccent` のように色相によらない値をわざと書いた ID を除くため）。
   - 2回の出力で値が同じ。
   - null でも完全な透明（アルファ0）でもない。

   これは、メインの色相に連動していない色、つまり Visual Studio Light か VSCode の既定値のまま残っている色である。
4. 漏れた ID の一覧を出力チャネルと `data/coverage-report.json` に書く。漏れた ID には 7.3 の規則を足すか、意図して残す理由を `data/coverage-allowlist.json` に書く。
5. 監査の最後に、ColorManager の書き込みを元の色相の値に戻す。

単体テストで、`coverage-report.json` の漏れが allowlist に載っているものだけであることを検査する。

### 7.5 generateColorTheme の出力の読み方

`workbench.action.generateColorTheme` は、無題の jsonc のエディタを開いて結果を書く。出力は JSON として正しくない（コメント行がある）ので、行ごとに読む。

1. `vscode.commands.executeCommand('workbench.action.generateColorTheme')` を await する。
2. `vscode.workspace.textDocuments` を100ミリ秒ごとに最大5秒調べ、`uri.scheme === 'untitled'` で、本文に `"$schema": "vscode://schemas/color-theme"` を含む文書を探す。`activeTextEditor` は切り替わりが遅れることがあるので使わない。
3. 本文を正規表現 `^\s*(\/\/)?"([^"]+)":\s*(null|"(#[0-9a-fA-F]{6,8})")` で行ごとに読み、ID、コメントかどうか、値を取り出す。
4. その文書を表示してから `workbench.action.revertAndCloseActiveEditor` で閉じる（閉じないと、未保存の無題のエディタが増え続ける）。

## 8. トークン色の上書き

VSCode のソースで確かめた仕様から、次のように書く。

- textMateRules の規則はテーマの規則のあとに追加される。セレクタが同じなら ColorManager の規則が勝つが、テーマのほうがより詳しいセレクタ（親スコープ付きなど）を持っていると、そちらが勝つ。そこで、light_vs.json の104個のセレクタを、親スコープ付きの5個も含めて一字一句同じ文字列で書く。
- 規則は1つのセレクタにつき1つとし、`scope` は配列ではなく文字列で書く。同じ文字列のセレクタが2回出てきたら1つにまとめ、ColorManager の役割表のほうを優先する。規則の数は light_vs の104個、ColorManager 独自のもの約40個、次に述べる4個で、約150個になる。
- 規則の設定は項目ごとに上書きされる。foreground だけを書くと、Visual Studio Light の fontStyle が残る。そこで、すべての規則に `fontStyle` を明示する。書式のない役割は `""`、書式のある役割（6.6）は `"italic"`、`"bold"`、`"underline"`、`"strikethrough"` を書く。Markdown の7個のセレクタは、6.6 の `md.*` の役割で、元と同じ書式（見出しと強調は bold、斜体は italic など）を保つ。
- `scope` がちょうど文字列 `"token.info-token"` の規則がないと、VSCode は `token.info-token`、`token.warn-token`、`token.error-token`、`token.debug-token` の既定の規則を ColorManager の規則のあとに追加し、それが勝ってしまう。そこで、この4つを1つずつ別の規則として書く。色は順に `status.info`、`status.warning`、`status.error`、`tok.keyword` とする。
- `editor.semanticHighlighting.enabled` が false の場合は semantic token の規則が効かないが、その設定はユーザーのものなので変えない。

light_vs.json のセレクタの役割は、`scripts/extract-light-vs.mjs` が次の規則を上から順に当てて決め、`data/light-vs-selectors.json` に `{ "selector": "...", "role": "...", "fontStyle": "..." }` の配列として書き出す。どの規則にも当たらないセレクタがあれば、スクリプトは失敗で終わる。この規則で104個すべてに役割が付くことを、計画の段階で確かめた。

| 順 | セレクタの先頭（正規表現） | 役割 |
|---|---|---|
| 1 | `^comment` | `tok.comment` |
| 2 | `^string\.regexp` | `tok.regexp` |
| 3 | `^string meta\.image`、`^(string\|markup\.inline\.raw\|meta\.embedded\.assembly)` | `tok.string` |
| 4 | `^constant\.character` | `tok.escape` |
| 5 | `^constant`、`^support\.constant` | `tok.number` |
| 6 | `^keyword\.operator\.(new\|expression\|cast\|sizeof\|alignof\|typeid\|alignas\|instanceof\|logical\.python\|wordlike)` | `tok.keyword` |
| 7 | `^keyword\.operator` | `tok.operator` |
| 8 | `^keyword` | `tok.keyword` |
| 9 | `^storage` | `tok.storage` |
| 10 | `^(entity\.name\.function\|support\.function)` | `tok.function` |
| 11 | `^(entity\.name\.(type\|class\|namespace\|scope-resolution)\|support\.(type(?!\.property-name)\|class)\|entity\.other\.inherited-class)` | `tok.type` |
| 12 | `^(entity\.name\.tag\|entity\.name\.selector)` | `tok.tag` |
| 13 | `^entity\.other\.attribute-name`、`^source\.css(\.less)? entity\.other\.attribute-name` | `tok.attribute` |
| 14 | `^variable\.parameter` | `tok.parameter` |
| 15 | `^(support\.variable\|variable\.other\.(property\|object\.property)\|meta\.object-literal\.key\|support\.type\.property-name\|meta\.structure\.dictionary\.key\.python)` | `tok.property` |
| 16 | `^(variable\|source\.css variable)` | `tok.variable` |
| 17 | `^punctuation` | `tok.operator` |
| 18 | `^(meta\.decorator\|entity\.name\.decorator)` | `tok.decorator` |
| 19 | `^markup\.heading` | `md.heading` |
| 20 | `^(markup\.bold\|strong)` | `md.bold` |
| 21 | `^(markup\.italic\|emphasis)` | `md.italic` |
| 22 | `^markup\.underline` | `md.link` |
| 23 | `^markup\.strikethrough` | `md.strike` |
| 24 | `^markup\.(quote\|list)` | `md.quote` |
| 25 | `^markup\.inserted` / `^markup\.deleted` / `^markup\.changed` / `^meta\.diff\.header` | `diff.inserted` / `diff.deleted` / `diff.changed` / `diff.header` |
| 26 | `^invalid` | `status.error` |
| 27 | `^meta\.preprocessor` | `tok.keyword` |
| 28 | `^(meta\.tag\|meta\.selector\|meta\.template\.expression\|meta\.embedded)$`、`^source\.\w+\.embedded$` | `fg` |

ColorManager 独自のセレクタは `src/payload/textmate.ts` に定数で持つ。少なくとも次を入れ、light_vs と同じ文字列のものは上の規則の結果より優先する。`keyword.control`、`storage.type`、`storage.modifier`、`entity.name.function`、`support.function`、`meta.function-call`、`entity.name.type`、`entity.name.class`、`support.class`、`string`、`string.quoted`、`string.template`、`constant.numeric`、`constant.language`、`variable.parameter`、`variable.other.property`、`variable.other.readwrite`、`variable.other.constant`、`comment`、`punctuation.definition.comment`、`keyword.operator`、`punctuation`、`string.regexp`、`constant.character.escape`、`entity.name.tag`、`entity.other.attribute-name`、`meta.decorator`、`markup.heading`、`markup.bold`、`markup.italic`、`markup.inline.raw`、`markup.underline.link`、`markup.quote`、`markup.list`、`markup.inserted`、`markup.deleted`、`markup.changed`。

semantic token は `"[Visual Studio Light]": { "enabled": true, "rules": { ... } }` に書く。値は必ず `{ "foreground": "#…", "italic": …, "bold": …, "underline": false, "strikethrough": false }` の形にし、書式も明示する。light_vs.json の4つのセレクタ（いずれも修飾子なし）を同じ文字列で書けば、ColorManager の規則が勝つ。

| semantic のセレクタ | 役割 | italic | bold |
|---|---|---|---|
| `newOperator` | `tok.keyword` | false | false |
| `stringLiteral` | `tok.string` | false | false |
| `customLiteral` | `editor.fg` | false | false |
| `numberLiteral` | `tok.number` | false | false |
| `namespace`、`type`、`class`、`interface`、`enum`、`struct`、`typeParameter` | `tok.type` | false | false |
| `enumMember` | `tok.number` | false | false |
| `function`、`method` | `tok.function` | false | false |
| `macro` | `tok.keyword` | false | false |
| `decorator` | `tok.function` | true | false |
| `parameter` | `tok.parameter` | true | false |
| `property`、`event` | `tok.property` | false | false |
| `variable` | `tok.variable` | false | false |
| `keyword` | `tok.keyword` | false | false |
| `comment` | `tok.comment` | true | false |
| `string` | `tok.string` | false | false |
| `number` | `tok.number` | false | false |
| `regexp` | `tok.regexp` | false | false |
| `operator` | `tok.operator` | false | false |
| `label` | `fg.secondary` | false | false |

TextMate の規則の例は次のとおり。

```jsonc
"editor.tokenColorCustomizations": {
  "[Visual Studio Light]": {
    "textMateRules": [
      { "scope": "token.info-token",  "settings": { "foreground": "#2a75ba", "fontStyle": "" } },
      { "scope": "token.warn-token",  "settings": { "foreground": "#bb7d29", "fontStyle": "" } },
      { "scope": "token.error-token", "settings": { "foreground": "#c53732", "fontStyle": "" } },
      { "scope": "token.debug-token", "settings": { "foreground": "#…", "fontStyle": "" } },
      { "scope": "comment", "settings": { "foreground": "#…", "fontStyle": "italic" } },
      { "scope": "source.css entity.other.attribute-name.class", "settings": { "foreground": "#…", "fontStyle": "" } },
      { "scope": "markup.heading", "settings": { "foreground": "#…", "fontStyle": "bold" } }
    ]
  }
}
```

## 9. settings.json への書き込み

### 9.1 書き込む場所と形

```jsonc
"workbench.colorCustomizations": {
  "[Visual Studio Light]": { "editor.background": "#e0f5f8", "…": "…" }
},
"editor.tokenColorCustomizations": {
  "[Visual Studio Light]": { "textMateRules": [ … ] }
},
"editor.semanticTokenColorCustomizations": {
  "[Visual Studio Light]": { "enabled": true, "rules": { … } }
}
```

- `"[Visual Studio Light]"` はテーマの表示名「Light (Visual Studio)」ではなく、テーマの id と照合される。light_vs の id は `"Visual Studio Light"` なので、この書き方で合っている。
- 前方一致の書き方（`"[Visual Studio*]"`）は Visual Studio Dark にも当たるので使わない。
- テーマ名付きの値はテーマ名のない値のあとに適用されるので、ユーザーがテーマ名なしで書いた色より優先される。
- `config.update()` はキーの値全体を `JSON.stringify` で書き直す。そのため、3つのキーの中にコメントや手で整えた書式があると、最初の書き込みで消える。ほかのテーマの値そのものは残る。3つのキーの外の部分はコメントも書式も変わらない。
- 新しいキーはファイルの末尾に追加される。

### 9.2 書き込み手順

`SettingsWriter.apply(payload)` は、確認の段階と書き込みの段階に分けて動く。確認の段階で1つでも条件を満たさなければ、どのキーも書かずに終わり、次の契機（10章）でやり直す。

```text
【確認の段階】3つのキーすべてを確かめてから、書き込みの段階に進む

1. colorManager.enabled が false なら終わる
2. themeGate.isTargetActive() が false なら終わる（9.9）
3. validatePayload(payload)
     - すべての色が /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/ に一致する
       （VSCode は解釈できない16進を赤として表示するので、必ず検査する）
     - needsTransparency の ID はアルファが 0xff 未満
     - 件数が想定の範囲（色 ID 100〜600、textMateRules 100〜250、semantic の規則 20〜60）
     失敗したら書かずにエラーを記録する（ColorManager の不具合なので、やり直さずに通知する）
4. settings.json の確認（settingsFile.ts）
     a. 場所を特定する（9.5）。特定できなければ終わる
     b. 未保存の変更がないか。workspace.textDocuments のうち、uri.path が settings.json の
        絶対パスと一致し、scheme が vscode-userdata か file の文書で、isDirty のものがあれば終わる
     c. 本文をバイト列で読み、jsonc-parser で解析する（allowTrailingComma: true）。構文エラーがあれば終わる
     d. 3つのキーの値がオブジェクトでなければ（配列、文字列など）終わる
     e. 解析した3つのキーの値が、それぞれ config.inspect(key).globalValue と深く等しいか確かめる。
        違えば、VSCode の読み込みがファイルに追いついていないので、この回は終わる
     f. 3つのキーの範囲の中にコメントがあれば（jsonc-parser の scanner で調べる）、初回だけ確認のダイアログを出す。
        「続ける（コメントは消える）」を選ぶまで終わる。答えは globalState に保存する
5. 所有の確認（9.3）。3つのキーのどれか1つでも「手で編集された」と判定したら、どのキーも書かずに止まる
6. 3つとも現在の値が payload と等しければ、書くものがないので成功として終わる

【書き込みの段階】

7. バックアップ（9.5）。失敗したら書かずに終わる
8. 3つのキーそれぞれについて、値が payload と違うものだけを順に書く
     a. もう一度 colorManager.enabled を読み、false なら残りを書かずに終わる（Remove との競合を防ぐ）
     b. current = 手順4cで解析した値（キーがなければ {}）
     c. 書く値のハッシュを ownership の記録に先に追加する（9.3）
     d. next = { ...current, '[Visual Studio Light]': payload[key] }（ほかのキーはそのまま。既存のキーの順番も保つ）
     e. await config.update(key, next, ConfigurationTarget.Global)
     f. 読み戻して、inspect(key).globalValue['[Visual Studio Light]'] が payload[key] と等しいことを確かめる
9. すべて成功したら lastAppliedKey を更新する（10章）
```

3つのキーは順に書くので、途中で失敗すると、ワークベンチの色だけが新しくトークン色が古い状態になる。この状態でも設定は壊れておらず、次の契機で残りが書かれる。

### 9.3 所有の確認

ColorManager が書いた値かどうかを、値のハッシュで判定する。ハッシュはキーを並べ替えて正規化した JSON の SHA-256 とする（VSCode が書式を整え直すので、本文の文字列から計算すると一致しない）。

`"[Visual Studio Light]"` の現在の値は次のどれかに当てはまれば「ColorManager のもの」とみなす。

1. 値がない（undefined）。
2. 今回書こうとしている payload と等しい。
3. ハッシュが globalState に保存した直近64件の書き込みのハッシュ（リングバッファ）に含まれる。拡張機能を更新して配色の計算が変わったときも、前のバージョンが書いた値をここで認める。
4. ハッシュが現在の設定（mode、slotsPerDay、tint、pinnedHue）と現在のバージョンで計算した全スロットの payload のハッシュのどれかと一致する。ほかのウィンドウが書いた値（globalState の反映が遅れる場合）を認めるための条件である。この一覧は設定が変わったときに計算し直してキャッシュする（96スロットで約0.5秒）。

どれにも当てはまらなければ「手で編集された」と判定する。

- 初回の書き込みで値がすでにある場合（ColorManager を入れる前からユーザーが書いていた場合）も、条件1〜4に当てはまらないので、同じく止まる。
- 止まったときは、ウィンドウにフォーカスがある（`window.state.focused`）ときだけ、確認のダイアログを出す。ウィンドウごとに「答え待ち」の状態を持ち、答え待ちの間はダイアログを重ねて出さず、書き込みもしない。
- 選択肢は「上書きする（バックアップを取る）」と「一時停止する」の2つ。上書きを選んだら、現在の値のハッシュをリングバッファに加えてから 9.2 の手順7へ進む。一時停止を選んだら `colorManager.enabled` を false にする。
- ダイアログを閉じた（どちらも選ばなかった）場合は、`ColorManager: Apply Now` を実行するまで書かない。

書き込みの前（9.2 の手順8c）にハッシュをリングバッファへ加えるので、update の直後に異常終了しても、次の起動で自分の書き込みを手の編集と誤判定しない。

### 9.4 エラーごとの扱い

`config.update()` は、拡張機能から呼んだ場合はエラーの通知を出さず、Promise が reject されるだけである。エラーのメッセージは VSCode の表示言語で変わるので、メッセージの文字列でエラーの種類を判定しない。主な原因は 9.2 の手順4で先に調べ、update の reject はすべて同じように扱う。

| 状況 | 検出の方法 | 扱い |
|---|---|---|
| 未保存の編集がある | 手順4b | 書かない。次の60秒ごとの確認でやり直す |
| 構文エラーがある | 手順4c | 書かない。出力チャネルに、状態が変わったときだけ記録する |
| ファイルと VSCode の読み込みがずれている | 手順4e | 書かない。次の60秒ごとの確認でやり直す |
| update の reject（ディスクのほうが新しい場合など） | update の reject | 1分、2分、4分、8分、15分と間隔を空けてやり直す。待っている間は60秒ごとの確認でも書かない |
| 3回続けて失敗 | 失敗の回数 | 通知を1回だけ出し、ステータスバーに警告のアイコンを出す。成功したら消す |
| 読み戻した値が一致しない | 手順8f | 書き込みを止め、通知を出す（ほかの何かが同時に書いている可能性がある） |
| validatePayload の失敗 | 手順3 | やり直さず、通知を出す |

ほかのウィンドウで settings.json に未保存の変更があっても、このウィンドウからは見えない。その場合は、ほかのウィンドウで保存するときに VSCode が衝突のダイアログを出す。どちらの内容も消えずに選べるので、設定は壊れない。README にこのことを書く。

### 9.5 settings.json の場所とバックアップ

拡張機能のホストには、プロファイルにかかわらず既定のプロファイルの保存場所が渡される。そのため `context.globalStorageUri`（scheme は `vscode-userdata`、パスは `<User>/globalStorage/local.colormanager`）から2階層上のフォルダの `settings.json` は、常に既定のプロファイルの settings.json である。ほかのプロファイルが有効なとき、`config.update()` は `<User>/profiles/<id>/settings.json` に書くので、場所がずれる。

そこで、対応するのは既定のプロファイルだけとし、次のすべてを確かめられたときだけ、その場所を settings.json として使う。

1. ファイルが存在し、読める。
2. 解析した3つのキーの値と `workbench.colorTheme` の値が、それぞれ `inspect(key).globalValue` と深く等しい。
3. 最初に書き込んだ直後に本文を読み直し、書いた payload の `editor.background` の値が本文に含まれている。

1か2が通らなければ書かない。3が通らなければ、それ以後は書かずに `colorManager.enabled` を false にし、「既定のプロファイル以外では使えない」と通知する。

バックアップは3種類取る。保存先のフォルダは最初に `workspace.fs.createDirectory` で作っておく。

| ファイル | 中身 | いつ取るか |
|---|---|---|
| `globalStorageUri/backups/settings-original.json` | settings.json のバイト列 | ColorManager が初めて書き込む直前に1回だけ。以後は上書きも削除もしない |
| `globalStorageUri/backups/settings-YYYYMMDD-HHmmss.json` | settings.json のバイト列 | 1日に1回まで（最後に取った日付を globalState に保存）と、9.3 で上書きを選んだとき。新しいものから20個を残す |
| globalState の `originalValues` | 3つのキーの、初めて書き込む前の `inspect().globalValue`（キーがなければ「なし」） | 初めて書き込む直前に1回だけ |

値を解析して保存するだけでは消えたコメントを戻せないので、ファイルそのものも写す。

### 9.6 元に戻す

コマンド `ColorManager: Remove Customizations` は次の順で元に戻す。

1. `colorManager.enabled` を false にする。ほかのウィンドウは 9.2 の手順1と手順8aでこの値を読んで書き込みをやめる。
2. 9.2 の手順4b〜4eと同じ確認をする。未保存の変更や構文エラーがあれば、元に戻さずに理由を通知して終わる（enabled は false のまま）。
3. 3つのキーそれぞれについて、次のとおりに書く。
   - `originalValues` に `"[Visual Studio Light]"` の値があった場合は、その値に戻す。
   - なかった場合は、`"[Visual Studio Light]"` を取り除いた値を書く。取り除いた結果が空のオブジェクトで、`originalValues` でキーが「なし」だった場合は、`config.update(key, undefined, ConfigurationTarget.Global)` でキーごと消す。
4. 所有の記録（リングバッファとキャッシュ）を消す。

コメントまで含めて完全に戻したいときのために、コマンド `ColorManager: Open Backups Folder` でバックアップのフォルダを開けるようにする。`settings-original.json` を手で settings.json に写せば、ColorManager を入れる前のバイト列に戻る。

### 9.7 複数ウィンドウ

VSCode のウィンドウごとに拡張機能のホストが動くので、ウィンドウの数だけ ColorManager が動く。ウィンドウをまたいだ書き込みの排他はないが、次の理由でロックは使わない。

- 書く値は時刻のスロットと設定だけで決まり、色 ID の一覧もコミットしたファイルだけを使う（7.2）ので、どのウィンドウが書いても同じ値になる。
- あるウィンドウが書くと、ほかのウィンドウにも設定の変更が届く。ほかのウィンドウは 9.2 の手順6で値が等しいことを確かめて書かない。
- 同時に書いた場合は、VSCode の etag の確認で片方が reject され、やり直しのときに値が等しいことを確かめて終わる。
- ほかのウィンドウが書いた値は、9.3 の条件4で ColorManager のものと認める。
- ロック用のファイルを使うと、異常終了やスリープでロックが残る問題が新たに起きる。

スロットが変わったときは、書き込みの前に0〜5秒のランダムな待ち時間を入れ、ウィンドウどうしの書き込みが重なる確率を下げる。

### 9.8 Settings Sync

Settings Sync が有効だと、15分ごとに数十KBの設定がアップロードされ、時差のある2台の端末で値を取り合うおそれがある。初回の起動時に `settingsSync.ignoredSettings` を読み、3つのキーが入っていなければ、追加するかを尋ねるダイアログを出す。「追加する」を選んだら、既存の配列に3つのキーを足して書く（ほかの項目は消さない）。

この設定はキー単位で効くので、3つのキーの中のほかのテーマの値も同期されなくなる。ダイアログの説明文にこのことを書く。尋ねるのは1回だけで、答えを globalState に保存する。「追加しない」を選んだ場合、ほかの端末から同期された値は 9.3 の条件に当てはまらないことがあり、そのときは手で編集されたものとして確認を求める。

### 9.9 その他の注意点

- テーマの判定（`themeGate.ts`）。拡張機能の API でテーマの名前は取れない（`window.activeColorTheme` は種類だけを返す）ので、VSCode と同じ順で判定する。
  1. `window.autoDetectHighContrast` が true（既定）で、`activeColorTheme.kind` がハイコントラストなら、対象外とする。
  2. `window.autoDetectColorScheme` が true なら、`activeColorTheme.kind` が Light のとき `workbench.preferredLightColorTheme`、Dark のとき `workbench.preferredDarkColorTheme` を現在のテーマとする。
  3. どちらでもなければ `workbench.colorTheme` を現在のテーマとする。

  この判定は書き込みを減らすためのものである。`"[Visual Studio Light]"` の値は VSCode がテーマを見て適用するので、判定を誤っても、ほかのテーマの見た目は変わらない。
- テーマを Visual Studio Light から切り替えても、`"[Visual Studio Light]"` の値は消さずに残す。ほかのテーマには影響しない。
- settings.json をエディタで開いている（未保存の変更はない）ときに ColorManager が書くと、その書き込みがエディタの元に戻す（Cmd+Z）の履歴に入る。Cmd+Z で ColorManager の書き込みが取り消されることがあるが、次の契機で 9.3 の判定（リングバッファに前の値がある）を通って書き直されるだけで、設定は壊れない。README にこのことを書く。
- VSCode のローカル履歴（`workbench.localHistory`）が settings.json の保存を記録する場合、1日96回の書き込みでユーザー自身の編集の履歴が押し出されるおそれがある。フェーズ3で記録されるかを確かめ、記録されるなら README に書く。
- settings.json の行数は、3つのキーで数百行増える見込みである。フェーズ4で実際の行数を測り、README に書く。
- 開発中のテストと動作確認は、必ず隔離した user-data-dir（`.vscode/launch.json` の `--user-data-dir=${workspaceFolder}/.dev-user-data`）で行い、本物の settings.json には書かない。本物に書くのはフェーズ5の導入のときが初めてである。

## 10. 更新のタイミング

`scheduler.ts` は、次の契機で「適用」を呼ぶ。

| 契機 | 待ち時間 |
|---|---|
| 拡張機能の起動（activate） | 0〜1秒 |
| 60秒ごとの確認で、現在のキーが lastAppliedKey と違うとき | スロットが変わった場合は0〜5秒、それ以外は0秒 |
| ウィンドウにフォーカスが戻ったとき | 0〜1秒 |
| `workbench.colorTheme`、`window.autoDetectColorScheme`、`workbench.preferred*ColorTheme`、`colorManager.*` が変わったとき | 500ミリ秒のデバウンス |
| コマンド `ColorManager: Apply Now` | 0秒（9.3 の「答え待ち」と、ダイアログを閉じたことによる停止も解除する） |

- キーは `lastAppliedKey = hash(H, mode, slotsPerDay, tint, PAYLOAD_VERSION)` とし、適用に成功したときだけ更新する。H には pinnedHue と timeOffsetMinutes が反映されるので、これらを変えても検出できる。`PAYLOAD_VERSION` は配色の計算や対応表を変えたら上げる定数である。
- 適用を飛ばした回（未保存の変更など）は、lastAppliedKey が古いままなので、次の60秒ごとの確認で自動的にやり直す。9.4 の間隔を空けたやり直しを待っている間は、60秒ごとの確認では何もしない。
- 時刻の到来を setTimeout で待つ方式は、スリープで時刻がずれるので使わない。スリープから戻ったあとは、60秒ごとの確認で遅くとも1分以内に適用される。
- ColorManager 自身の書き込みでも `onDidChangeConfiguration` が起きる。3つのキーの変更は契機にしない（無限に書き続けないため）。
- 色の計算（約300色と約150規則）は1回5ミリ秒以内を目標にする。

## 11. 拡張機能の設定項目とコマンド

設定項目は次のとおり。

| キー | 型 | 既定値 | 説明 |
|---|---|---|---|
| `colorManager.enabled` | boolean | true | false にすると書き込みを止める |
| `colorManager.mode` | `"normal"` \| `"sky"` | `"normal"` | 時刻と色相の対応 |
| `colorManager.slotsPerDay` | 24 \| 48 \| 96 \| 144 | 96 | 1日のスロット数 |
| `colorManager.tint` | number（0.75〜1.2） | 1.0 | 淡い面の色の濃さ |
| `colorManager.pinnedHue` | number \| null | null | 値を入れると、時刻に関係なくその色相に固定する（調整用） |
| `colorManager.timeOffsetMinutes` | number | 0 | 時刻をずらして確かめる（調整用） |

コマンドは次のとおり。

| コマンド | 動作 |
|---|---|
| `ColorManager: Apply Now` | すぐに適用する |
| `ColorManager: Pause` / `ColorManager: Resume` | `colorManager.enabled` を切り替える |
| `ColorManager: Show Status` | 出力チャネルに、現在のスロット、色相、モード、次の更新の時刻、最後のエラー、所有の確認の状態を書く |
| `ColorManager: Remove Customizations` | 9.6 の手順で元に戻す |
| `ColorManager: Open Backups Folder` | バックアップのフォルダを開く |
| `ColorManager (dev): Dump Color Registry` | 7.2。開発用の環境でだけ表示する |
| `ColorManager (dev): Audit Coverage` | 7.4。開発用の環境でだけ表示する |

開発用のコマンドは `package.json` の `"enablement": "colorManager.isDevelopment"` でコマンドパレットから隠す。activate で `context.extensionMode === vscode.ExtensionMode.Development` のときだけ `vscode.commands.executeCommand('setContext', 'colorManager.isDevelopment', true)` を実行する。さらに、それぞれのコマンドの処理の先頭でも `extensionMode` を確かめ、開発モードでなければ何もしない。

## 12. テスト計画

### 12.1 単体テスト（vitest）

| 対象 | 検査する内容 |
|---|---|
| `color/oklab.ts` | #ff0000 → L 0.628、C 0.258、h 29.23 など、既知の値との一致（誤差1e-3）。往復の変換で元に戻る |
| `color/gamut.ts` | 全役割が全色相（0.25°刻み）で sRGB に収まる。`softC` が上限以下で、色相に対して連続 |
| `color/contrast.ts` | WCAG と APCA が参照値（試作の `ok.py`）と一致する |
| `color/hex.ts` | 6.11 のアルファの計算で、重ねた結果が T と一致する（各チャンネル±1）。全スロットで切り詰めが0回 |
| `palette/time.ts` | 各モードの 00:00、06:00、12:00、18:00、23:45 の色相。スロット95から0への差がほかと同じ。pinnedHue と timeOffsetMinutes の反映 |
| `palette/generate.ts` | 両モード × 全96スロットで、6.10 の PAIRS の下限を満たし、guard の補正回数が0 |
| 同上 | 隣のスロットとの ΔE_OK の最大値が全役割で0.02未満 |
| 同上 | 6.6 の上の表の12役割（別名を除く）どうしの ΔE_OK の最小値が0.045以上。number と regexp だけは0.04以上 |
| 同上 | シンタックスの色を `sel.editor`（重ねたあとの色）の上に置いたとき、WCAG 3.0 以上 |
| `palette/status.ts` | アクセントとの色差の最小値が error 0.075、warning 0.12、success 0.08、info 0.055 以上 |
| `payload/build.ts` | light_vs の104セレクタと4つの semantic セレクタがすべて含まれ、すべての textMate の規則に fontStyle があり、scope が文字列。`token.info-token` などの4規則がある。semantic の値に italic と bold がある |
| `payload/validate.ts` | 不正な16進、不透明な needsTransparency の色、件数の外れを拒否する |
| `payload/workbenchMap.ts` | light_vs の48色が全部割り当てられている。`vsLightDefault: "null"` の ID に末尾の規則が当たっていない。`coverage-report.json` の漏れが allowlist の範囲内 |
| `ownership.ts` | 9.3 の条件1〜4のそれぞれで「ColorManager のもの」と判定し、どれにも当てはまらない値で「手で編集された」と判定する |
| `settingsWriter.ts`（VSCode の API を偽物に差し替える） | ほかのテーマの値を残す。等しければ書かない。所有の確認で1つでも止まれば、どのキーも書かない。書く前にハッシュを記録する。update の失敗で間隔を空けてやり直す。値がオブジェクトでなければ書かない。手順8aで enabled が false なら残りを書かない |
| `scheduler.ts`（偽の時計） | lastAppliedKey が変わったときだけ適用する。スリープ明けの最初の確認で適用する。3つのキーの変更では適用しない。デバウンスが効く |

### 12.2 結合テスト（@vscode/test-electron）

隔離した user-data-dir に `test/fixtures/` の settings.json を置いて VSCode を起動し、本物の `config.update()` で次を確かめる。fixture は本物の settings.json と同じ癖（タブとスペースの混在、末尾のカンマ、行コメントとブロックコメント、`"[python]"` のような言語ごとの設定）を持つように作る。本物の settings.json の中身はリポジトリに入れない。

「3つのキーの外が変わっていない」ことは、次の方法で比べる。適用前と適用後の本文のそれぞれから、jsonc-parser の `modify` で3つのキーと `colorManager.enabled` と `settingsSync.ignoredSettings` を取り除き、残った本文をバイト列で比べる。

1. 適用後、上の方法で比べた本文が適用前と完全に一致する。
2. 3つのキーにほかのテーマの値（例 `"[Monokai]"`）があると、適用後も値が残る。
3. settings.json を開いて未保存の変更を作ると、書き込まない。
4. 構文エラーのある settings.json では、書き込まず、ファイルが1バイトも変わらない。
5. `Remove Customizations` のあと、上の方法で比べた本文が適用前と一致し、3つのキーがもともとなかった fixture ではキーが残っていない。
6. `"[Visual Studio Light]"` の値を手で書き換えると、次の適用で書き込まず、確認のダイアログを出す。
7. テーマを Visual Studio Dark にすると、書き込まない。
8. `settings-original.json` が適用前の本文とバイト列で一致する。

### 12.3 目で見る確認

- `npm run preview` で `out/preview.html` を作る。両モードの全96スロットについて、面の色の帯と、エディタの見本（TypeScript、JSON、Markdown のコードに色を付けたもの）とステータスバーを並べる。時刻のスライダーで1日を流して見られるようにする。
- 実際の VSCode では、開発用の環境で `colorManager.pinnedHue` を変えながら確かめる。特に、`sky` の 09:30〜11:30（黄色の帯）と、`normal` の 10:15〜13:00（シアンの帯）を重点的に見る。

## 13. 実装手順

各フェーズの完了条件をすべて満たしてから次へ進む。フェーズ2の終わりと、フェーズ5の導入の前に、ユーザーに見てもらう。

### フェーズ0 リポジトリの準備

- `git init`。`.gitignore` に `node_modules/`、`dist/`、`out/`、`*.vsix`、`.vscode-test/`、`.dev-user-data/` を書く。
- `package.json`、`tsconfig.json`（strict）、`esbuild.mjs`、`vitest.config.ts` を作る。
- `.vscode/launch.json` に、隔離した user-data-dir で拡張機能を起動する設定を書く。

  ```jsonc
  {
    "name": "Run Extension (isolated)",
    "type": "extensionHost",
    "request": "launch",
    "args": [
      "--extensionDevelopmentPath=${workspaceFolder}",
      "--user-data-dir=${workspaceFolder}/.dev-user-data"
    ],
    "outFiles": ["${workspaceFolder}/dist/**/*.js"],
    "preLaunchTask": "npm: build"
  }
  ```

- `CLAUDE.md` に作業の決まりを書く。日本語の文書は yomiyasu を通すこと、本物の settings.json に書くのは導入のときだけであること、`data/` を作り直す手順。
- 試作スクリプトと yomiyasu スキルを含めて最初のコミットをする。
- 完了条件: `npm run build` と `npm test`（空のテスト）が通り、F5 で隔離した環境の VSCode が起動する。

### フェーズ1 色の計算

- `color/` の5つのファイルと `palette/time.ts` を実装する。
- 完了条件: 12.1 の `color/` と `time.ts` の検査が通り、試作の `ok.py` と同じ入力で同じ16進が出る（試作の値を fixture として保存して比べる）。

### フェーズ2 配色の生成と見本

- `palette/` の残りのファイルを実装し、6章の表をそのまま入れる。
- ANSI の色（6.9）を検査にかけて値を決める。
- `scripts/preview.mjs` を作る。
- 完了条件: 12.1 の `palette/` の検査が通る。見本の HTML をユーザーに見てもらい、面の濃さ（`tint`）とアンカーの補正について意見をもらう。出た調整は表の値を変えてから検査を通し直す。

### フェーズ3 安全な書き込みと最小限の起動

- `settingsFile.ts`、`ownership.ts`、`backup.ts`、`themeGate.ts`、`settingsWriter.ts` を実装する。
- 最小限の `extension.ts` と `config.ts` を作る。`ColorManager: Apply Now` と、`pinnedHue`、`enabled` の読み取りだけを入れる。このフェーズでは light_vs の48色とシンタックスの規則だけを書く仮の payload を使う。
- ローカル履歴が settings.json の保存を記録するかを確かめる（9.9）。
- 完了条件: 12.1 の `ownership.ts` と `settingsWriter.ts` の検査と、12.2 の結合テスト1〜8がすべて通る。

### フェーズ4 色 ID とトークン色の割り当て

- `dev/generateThemeDump.ts` と `dev/dumpRegistry.ts` を実装し、隔離した環境で `data/color-registry.json` を作る。
- `scripts/extract-light-vs.mjs` で `data/light-vs-selectors.json` を作る。
- `payload/` を実装する。
- `dev/auditCoverage.ts` を実装し、漏れがなくなるまで 7.3 の規則を足す。
- 完了条件: 12.1 の `payload/` の検査が通り、監査の漏れが allowlist の範囲内である。隔離した環境で `pinnedHue` を30°ずつ変え、見た目に破綻がないことを確かめる。settings.json に増える行数を測る。

### フェーズ5 スケジューラ、コマンド、導入

- `scheduler.ts`、`log.ts`、残りの設定項目とコマンドを実装し、`extension.ts` を仕上げる。
- `README.md` に、導入、設定、元に戻す方法、Cmd+Z の注意、ほかのウィンドウで未保存の変更があるときの注意、`data/` を作り直す手順を書く（yomiyasu を通す）。
- ユーザーに確認を取ってから、本物の環境に導入する。

  ```bash
  npm run package
  cp ~/Library/Application\ Support/Code/User/settings.json ~/settings.json.before-colormanager
  code --install-extension colormanager-0.1.0.vsix --force
  ```

- 初回の起動で、9.8 の Settings Sync のダイアログに答える。
- 完了条件: 本物の環境で1回目の書き込みが成功し、`settings-original.json` ができ、12.2 と同じ方法で比べた本文が導入前のコピーと一致する。

### フェーズ6 慣らし運転と調整

- 2〜3日使い、気になった時刻の色を `ColorManager: Show Status` で記録する。
- アンカーの表と役割の表を直し、検査を通してから `PAYLOAD_VERSION` を上げ、VSIX を作り直して入れ直す。

## 14. リスクと対策

| リスク | 対策 |
|---|---|
| 3つのキーの中のコメントが消える | 9.2 の手順4fで、初回にコメントを探して確認を求める。バイト列のバックアップを取る |
| 不正な16進が赤で表示される | validatePayload で形式を検査し、不正なら書かない |
| 透明が必須の色を不透明にして、選択範囲などが見えなくなる | 色 ID 一覧の `needsTransparency` を使って必ずアルファを付け、validatePayload でも検査する |
| Visual Studio Light の書式（italic など）が残る | すべての規則に `fontStyle` を明示し、セレクタを一字一句同じにする |
| ほかのテーマの値を古い内容で上書きする | 9.2 の手順4eで、ファイルと VSCode の読み込みが一致するときだけ書く |
| 既定以外のプロファイルで、違うファイルをバックアップする | 9.5 の確認が通らなければ書かない |
| 同期で設定を取り合う | 9.8 で ignoredSettings に加える |
| VSCode の更新で色 ID が増える、変わる | 更新後に Dump と Audit を実行し直す（README に手順を書く） |
| 未保存の編集を上書きする | VSCode が拒否する。さらに 9.2 の手順4bで事前に調べる |
| 書き込みが失敗し続ける | 間隔を空けてやり直し、3回続けば通知とステータスバーで知らせる |
| 別の拡張機能が同じキーを書き換える | 9.3 の判定で手の編集として検出し、止まって確認する |
| ローカル履歴が書き込みで埋まる | フェーズ3で確かめ、必要なら README に書く |
| 調整の途中で本物の設定に書いてしまう | 開発と結合テストは隔離した user-data-dir だけで行う。本物への導入はユーザーの確認を取ってから |

## 15. 未決事項

- `sky` で深夜を藍（約275°）に寄せる、不等間隔の写像（6.2）。慣らし運転のあとで決める。
- settings.json への書き込みに問題が出た場合の代わりとして、独自テーマを `_watch` で読み直させる方式（4章）。必要になったら、ファイルの置き換えが変更として検出されるかを先に試す。
- ANSI の16色の値（6.9）。フェーズ2で検査してから決める。
- `colorManager.tint` の既定値。フェーズ2の見本を見てユーザーと決める。

## 付録A VSCode のソースで確かめた事実

2026-10-18 に microsoft/vscode の main ブランチで確かめた。1.141.0 のタグとは細部が違う可能性がある。

| 事実 | 出典 |
|---|---|
| 設定の書き込みは jsonc の `setProperty` で、対象のキーの値の範囲だけを置き換え、その範囲だけを整形する | `src/vs/workbench/services/configuration/common/configurationEditing.ts`、`jsonEdit.setProperty` |
| 書き込みのパスは `[key]` なので、キーの値全体が書き直される | 同上 `getConfigurationEditOperation` |
| 構文エラーがあると `ERROR_INVALID_CONFIGURATION` で拒否する（末尾のカンマとコメントは許す） | 同上 `updateConfiguration`、`hasParseErrors` |
| 拡張機能からの書き込みでは、未保存の変更があると `ERROR_CONFIGURATION_FILE_DIRTY` で拒否する。通知は出ない | `mainThreadConfiguration.ts` `_updateValue`（`donotNotifyError: true`） |
| ディスクのほうが新しいと `ERROR_CONFIGURATION_FILE_MODIFIED_SINCE` で拒否する | `textFileEditorModel.ts` の etag の確認 |
| `config.update(key, undefined, target)` は、そのキーを取り除く | `configurationEditing.ts` |
| 拡張機能のホストには、既定のプロファイルの保存場所が渡される。`globalStorageUri` の scheme は `vscode-userdata` | `localProcessExtensionHost.ts`、`environmentService.ts` |
| テーマ名付きのキーはテーマの id（`settingsId = theme.id \|\| label`）と照合する。前方一致、後方一致、部分一致の書き方と、複数テーマの並記がある | `colorThemeData.ts` `fromExtensionTheme`、`isThemeScopeMatch` |
| テーマ名付きの値は、テーマ名なしの値のあとに適用される | `colorThemeData.ts` `setCustomColors` |
| textMateRules はテーマの規則のあとに追加され、同じセレクタなら後のものが勝つ。より詳しいセレクタは前のものでも勝つ。設定は項目ごとに上書きされる | `colorThemeData.ts` `get tokenColors()`、vscode-textmate `theme.ts` |
| `token.info-token` の規則がないと、既定の4規則が ColorManager の規則のあとに追加される | `colorThemeData.ts`（`hasDefaultTokens`） |
| semantic token の規則は、同じ点数ならあとの規則（ユーザーの規則）が勝つ | `colorThemeData.ts` `getTokenStyle` |
| `vscode://schemas/workbench-colors` を `workspace.fs.readFile` で読める | `settingsFilesystemProvider.ts`、JSON 拡張機能の `jsonClient.ts` |
| 透明が必須の色は、スキーマの `pattern` で分かる。`patternErrorMessage` は翻訳される | `colorUtils.ts` `registerColor` |
| `generateColorTheme` は、設定された色をキー、派生した色を `//"id": "#値"`、null の色を `//"id": null` として出力し、非推奨の色を除く | `themes.contribution.ts` |
| 不明な色 ID は警告になるだけで、拒否されない | `themeConfiguration.ts` |
| 解釈できない16進は赤になる | `Color.fromHex` |
| テーマファイルの変更を読み直すのは、拡張機能の開発中か `_watch: true` のときだけ | `workbenchThemeService.ts` `ThemeFileWatcher` |
| 設定の書き込みの排他はウィンドウごとで、ウィンドウをまたぐのは etag の確認だけ | `configurationEditing.ts` の `Queue` |
| `enablement` が false のコマンドは、コマンドパレットに出ない | `commandsQuickAccess.ts` |
| `settingsSync.ignoredSettings` は最上位のキー単位で同期から外す | `userDataSync.ts`、`settingsMerge.ts` |

## 付録B 試作スクリプト

`research/palette-prototype/` に、6章の数値を出した Python のスクリプトを置いている。実行には numpy が要る。

| ファイル | 内容 |
|---|---|
| `ok.py` | OKLab の変換、最大彩度、WCAG、APCA |
| `gamut.py` | 6.4 の表 |
| `final.py` | 6.5〜6.7 の役割表、コントラスト、色差（試作では decorator と attribute に独自の色を使っている） |
| `status.py`、`status2.py` | 6.8 の衝突回避、6.2 の n の比較とモード |

```bash
cd research/palette-prototype
python3 final.py
```

TypeScript の実装では、フェーズ1でこのスクリプトと同じ入力に対して同じ16進が出ることを確かめる。
