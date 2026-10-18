# ColorManager

VSCode の配色を時刻に合わせて少しずつ変え、1日で色相を一周させる個人用の拡張機能です。テーマに「Visual Studio Light」を選んでいるときだけ、settings.json の `"[Visual Studio Light]"` の値を書き換えて配色を適用します。Visual Studio Light の色は基準にせず、ColorManager の色ですべて置き換えます。

設計の詳細と理由は [docs/implementation-plan.md](docs/implementation-plan.md) にあります。

## 仕組み

- 1日を96個の時間帯（15分ごと）に分け、時間帯ごとにメインの色相を決めます。色相は1スロットで3.75°進み、1日で360°回ります。
- 色は OKLCH 色空間で、役割（エディタの背景、サイドバー、アクセント、キーワードなど）ごとに明度と彩度を固定し、色相だけを変えます。
- エラーの赤や Git の追加の緑のように意味が決まった色は、色相を固定します。
- 書き換えるのは `workbench.colorCustomizations`、`editor.tokenColorCustomizations`、`editor.semanticTokenColorCustomizations` の中の `"[Visual Studio Light]"` の値だけです。ほかのテーマを選ぶと、VSCode はこの値を使いません。

## 導入

Node.js 24 と VSCode 1.140 以上が必要です。

```bash
npm install
npm run package          # 型検査、単体テスト、ビルドのあと colormanager-0.1.0.vsix を作る
code --install-extension colormanager-0.1.0.vsix --force
```

初めて起動したときに、次の2つを尋ねることがあります。

- Settings Sync の対象から3つのキーを外すかどうか。15分ごとの書き込みが同期されないように、外すことを勧めます。キー単位で外れるので、ほかのテーマ用にこれらのキーに書いた色も同期されなくなります。
- 書き換える範囲にコメントや手で書いた値があるときに、上書きしてよいかどうか。

## 設定

| キー | 既定値 | 説明 |
|---|---|---|
| `colorManager.enabled` | `true` | false にすると書き込みを止めます |
| `colorManager.mode` | `"normal"` | `normal` は0時に赤から始めて色相環の順に進みます。`sky` は空の色に寄せます（正午アンバー、夕方ローズ、深夜藍、明け方ティール） |
| `colorManager.slotsPerDay` | `96` | 1日の時間帯の数（24、48、96、144） |
| `colorManager.tint` | `1.0` | 淡い面の色の濃さ（0.75〜1.2） |
| `colorManager.pinnedHue` | `null` | 数値を入れると、その色相に固定します（調整用） |
| `colorManager.timeOffsetMinutes` | `0` | 時刻をずらして確かめます（調整用） |

## コマンド

コマンドパレットで「ColorManager」と入力すると出てきます。

| コマンド | 動作 |
|---|---|
| ColorManager: Apply Now | すぐに適用します。上書きの確認を閉じて止まっているときも、これで再開します |
| ColorManager: Pause / Resume | 書き込みを止める、再開する |
| ColorManager: Show Status | 出力パネルに、現在の時間帯、色相、最後の結果などを表示します |
| ColorManager: Remove Customizations | ColorManager が書いた値を取り除き、導入前の状態に戻します |
| ColorManager: Open Backups Folder | settings.json のバックアップのフォルダを開きます |

## 設定を壊さないための仕組み

- 書き込みは VSCode の設定 API（`config.update`）だけを使います。VSCode は、構文エラーがあるときと、未保存の変更があるときに書き込みを拒否します。ColorManager も書く前に同じことを調べます。
- 初めて書き込む直前に、settings.json のバイト列を `settings-original.json` として保存します。このファイルは以後上書きしません。ほかに1日1回、日付つきのバックアップを取り、新しいものから20個を残します。
- `"[Visual Studio Light]"` の値を手で書き換えると、上書きせずに止まって確認を求めます。
- 対応するのは既定のプロファイルだけです。ほかのプロファイルでは書き込みません。

## 注意

- 3つのキーは値全体が書き直されます。この3つのキーの中にコメントを書いても、最初の書き込みで消えます。3つのキーの外はコメントも書式も変わりません。
- settings.json は3つのキーの分だけ約1,850行増えます。新しいキーはファイルの末尾に追加されます。
- settings.json をエディタで開いているときに ColorManager が書き込むと、その書き込みがエディタの元に戻す（Cmd+Z）の履歴に入ります。Cmd+Z で取り消しても、次の時間帯でまた書かれるだけで、設定は壊れません。
- ほかのウィンドウで settings.json に未保存の変更があると、そのウィンドウで保存するときに VSCode が衝突のダイアログを出します。どちらの内容も消えずに選べます。

## 元に戻す

1. コマンド「ColorManager: Remove Customizations」を実行します。
2. 拡張機能を外す場合は、そのあとでアンインストールします。

コメントまで含めて導入前のバイト列に戻したいときは、「ColorManager: Open Backups Folder」で開いたフォルダの `settings-original.json` を settings.json に写します。

## 開発

| コマンド | 内容 |
|---|---|
| `npm test` | 単体テスト（vitest） |
| `npm run typecheck` | 型検査 |
| `npm run test:integration` | 結合テスト。インストール済みの VSCode を、使い捨ての user-data-dir で起動して実行します |
| `npm run preview` | 両モードの全時間帯の見本を `out/preview.html` に書き出します |
| `node test/integration/run.mjs showcase` | 隔離した VSCode のウィンドウを色相ごとに撮り、`out/showcase/` に保存します |

開発用の起動設定（F5）も専用の user-data-dir（`.dev-user-data/`）を使います。本物の settings.json には書きません。

### VSCode や拡張機能を更新したとき

色 ID の一覧はリポジトリにコミットしたデータを使います。VSCode を更新したときと、色を登録する拡張機能を入れたり外したりしたときは、次の順に作り直します。

```bash
npm run build
node test/integration/run.mjs dump-registry     # data/color-registry.core.json
node scripts/scan-extension-colors.mjs          # data/color-registry.extensions.json
npm run extract-light-vs                        # data/light-vs-selectors.json
node test/integration/run.mjs audit-literals    # data/color-literals.json
node test/integration/run.mjs audit             # data/coverage-report.json（漏れが0件か確かめる）
npm test
```

配色の表や対応表を変えたときは、`src/payload/build.ts` の `PAYLOAD_VERSION` を上げてください。
