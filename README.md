# ColorManager

VSCode の配色を時刻に合わせて少しずつ変え、1日で色相を一周させる拡張機能です。テーマに「Visual Studio Light」を選んでいるときだけ働き、Visual Studio Light の色をすべて ColorManager の色に置き換えます。

## インストール

```bash
code --install-extension colormanager-0.1.3.vsix
```

テーマに「Visual Studio Light」を選ぶと、配色が変わり始めます。15分ごとに色相が少しずつ進みます。

初めて起動したときに、Settings Sync の対象から ColorManager が書き換える3つの設定を外すかどうかを尋ねられます。外すことをおすすめします。

## 設定

| キー | 既定値 | 説明 |
|---|---|---|
| `colorManager.enabled` | `true` | false にすると、配色の書き込みを止めます |
| `colorManager.mode` | `"normal"` | `normal` は0時に赤から始めて色相環の順に進みます。`sky` は空の色に寄せます（正午アンバー、夕方ローズ、深夜藍、明け方ティール） |
| `colorManager.slotsPerDay` | `96` | 1日をいくつの時間帯に分けるか（24、48、96、144） |
| `colorManager.tint` | `1.0` | 背景の色の濃さ（0.75〜1.2） |
| `colorManager.pinnedHue` | `null` | 数値を入れると、その色相に固定します |
| `colorManager.timeOffsetMinutes` | `0` | 時刻をずらして表示します |

## コマンド

| コマンド | 動作 |
|---|---|
| ColorManager: Apply Now | すぐに配色を適用します |
| ColorManager: Pause / Resume | 書き込みを止める、再開する |
| ColorManager: Show Status | 現在の時間帯と色相、最後の書き込みの結果を表示します |
| ColorManager: Remove Customizations | ColorManager が書いた配色を取り除き、導入前の状態に戻します |
| ColorManager: Open Backups Folder | settings.json のバックアップのフォルダを開きます |

## settings.json について

ColorManager は settings.json の `workbench.colorCustomizations`、`editor.tokenColorCustomizations`、`editor.semanticTokenColorCustomizations` の中の `"[Visual Studio Light]"` だけを書き換えます。

- それ以外の設定、コメント、書式は変わりません。
- 構文エラーや未保存の変更があるときは書き込みません。
- `"[Visual Studio Light]"` の中身を手で書き換えると、上書きせずに確認を求めます。
- 初めて書き込む前の settings.json を `settings-original.json` として保存し、そのほかに1日1回バックアップを取ります（最大20個）。
- 3つの設定の中に書いたコメントは、最初の書き込みで消えます。
- settings.json は約1,850行増えます。
- 対応しているのは既定のプロファイルだけです。

## 開発

Node.js 24 が必要です。

```bash
npm ci
npm test                   # 単体テスト
npm run test:integration   # 結合テスト（macOS）
npm run package            # VSIX を作る
```
