# 変更履歴

## 0.1.0（2026-10-18）

最初のバージョンです。

- 1日を96個の時間帯に分け、OKLCH の色相を1日で一周させる配色を生成します。モードは `normal` と `sky` の2つです。
- VSCode 1.141.0 の色 ID のうち、Visual Studio Light の色が残らない範囲（758個）と、TextMate の規則128個、semantic token の規則27個を書きます。
- 書き込みの前に、構文エラー、未保存の変更、手による編集を調べ、settings.json をバックアップします。
- コマンド「Remove Customizations」で導入前の状態に戻せます。
