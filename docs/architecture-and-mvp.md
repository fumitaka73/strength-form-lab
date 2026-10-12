# 調査とMVP設計

調査対象: personal-sports-form-lab の main、2026-10-12、commit `4f348045c0a8ea38c4d6d81fb4bda89a4fbb0ea2`。一時ディレクトリへの読み取り用cloneを調査し、元リポジトリには変更・pushしない。

## 既存構成

Vite 8.3.3、ES ModulesのJavaScript、HTML/CSS。`main.js` と `app-shell.js` が画面を統括。`pose-engine.js` はMediaPipe Pose Liteをローカルアセットからロードし、`pose.js` は12fpsの動画走査を担当。`pose-coordinates.js` は表示比率・余白・鏡像の骨格位置を統一する。

Good Form、Single Shot、Session、Live Pose、Live Coach、レビュー、検出チェック、全編タイムライン、本人のフィードバックによるキャリブレーションを提供。`shot-engine.js` / `session.js` / `auto-phases.js` / `shot-detector.js` はバスケットボール固有。ボール・リング・成否推定も独立モジュール。

`storage.js` はIndexedDB `sports-form-lab` v4、videos/results/settings/temporaryVideos/poseSessions/poseChunks/calibrations。動画Blob、姿勢チャンク、結果、基準スナップショット、手動レビュー、承認済み設定を保持。`pose-archive.js` は軽量チャンク保存。トランザクション完了で保存成功を判定し、複数レコードを原子的に保存する。

テストはNode組込み `node --test`、27個のtestファイル。Single Shotの固定スナップショット、検出・採点、欠測、レビュー、タイムライン、キャリブレーションを検証。`scripts/check-*.mjs/cjs` は別途Playwrightを導入して疑似動画・姿勢でUIを確認する。READMEの古いテスト件数は最新版の実行件数とはみなさない。元アプリのテストは今回未実行。

外部LLM APIはない。「AIの改善」は本人レビューを訓練・検証へ分離し、既存ルールの候補を比較して明示承認するローカル機能。`coach-voice.js` はブラウザspeechSynthesis。

## 再利用・新規開発

|対象|MVP方針|
|---|---|
|姿勢エンジン、ローカルモデル配信|pose-engine.jsとcopy-pose-assets.jsをそのまま移植|
|骨格オーバーレイ・画面比率|pose-coordinates.jsをそのまま移植|
|音声|coach-voice.jsを移植、RDL用の参考情報を明示操作で読み上げ|
|動画走査・Safari|seekタイムアウト、playsinline、12fps・640px入力の考え方を再利用。シュート依存を避けvideo.jsを新規作成|
|保存|トランザクション設計を再利用し、独立DB strength-form-lab v2に新規実装|
|レビュー・Good Form|UIは筋トレ用に新規作成、動画/角度差/メモ/履歴を提供|
|ヒップヒンジ・レップ・評価|rdl.jsを新規作成。シュート検出・採点閾値を流用しない|
|外部AI、個人学習|MVPでは未実装。秘密情報を必要とする機能は将来バックエンド経由で実装|

## MVP画面と開発ステップ

1. 分析: iPhoneのネイティブ撮影・ファイル選択、撮影条件、レップ候補、骨格再生、速度変更、タイムライン、音声、レビュー。
2. Good Form: 本人が選んだ基準の登録・再生・比較。最初の完成レップを基準に角度差を提示。医学的な採点や理想角度は設定しない。
3. 履歴: 端末への保存、再読込、メモ更新、個別削除、元動画書き出し。

第一段階は上記フローと欠測・保存分離のテスト。第二段階は本人の横向きRDL動画と指導者レビューで本数・誤検出・閾値を検証し、手動でのレップ追加/除外と同期比較を実装。第三段階でexerciseごとの測定・検出アダプターを追加してスクワット/ベンチへ拡張。まだ対応しない種目を選べるようにはしない。将来AIは動画送信の明示同意・サーバー側認証を含む別設計とする。

## 計測の定義・限界

同じ側の肩/股関節/膝/足首のvisibility>=0.65、画面内・有限座標が必要。xを動画アスペクト比で補正。股関節・膝の角度、肩と股関節を結ぶ線の鉛直からの傾き、1レップの股関節角度の幅を計測。体幹線は背骨の形状ではない。

解析版はrdl-2d-v2。レップは3フレームの立位（股関節>=155度）→屈曲<135度→3フレーム立位。可動域30度以上、0.8–15秒。最後の立位から下降開始まで最大1秒。中間姿勢でこれを超えた場合は新しい立位が必要。欠測または0.3秒超のギャップで状態を解除。これは未検証の工学的閾値で、RDLか別のヒンジ運動かは確定しない。未完成レップは数えず、架空の結果を作らない。

比較は同じ種目・解析版・側・横向き、双方80%以上計測でき、基準レップがある場合のみ。撮影位置/遠近の一致は自動で証明できない。差は良し悪しのスコアではない。斜め・正面では自動判定を保留する。visibilityは角度精度の保証ではない。

## データ保護

DB名は `strength-form-lab`。同じgithub.ioオリジン上ではURLのパスでIndexedDBが分離されないため、DB名を必ず分ける。sports-form-labを開くコード、移行、全DB削除、既存データの取り込みは入れない。新アプリのレコードだけ個別削除可能。動画・Pose・評価・基準のスナップショットを1レコードに保存。保存容量不足では失敗を表示し、保存成功とは表示しない。Safariの永続性は保証されないため元動画を保管する。MVPのJSONバックアップは未対応。

## GitHub Pages

既存と同じViteの相対base `./` とモデルのBASE_URLを利用。外部モデルCDNは不要。PRではnpm ci/test/buildとChromium UIテスト、mainへのマージ後、初回公開を判断してdeploy-pages.ymlを手動実行すると、同じcommitの単体/ブラウザテスト・ビルドを再実行したうえでdistを公開。GitHub Settings → Pages → SourceをGitHub Actionsへ設定する。PRから公開しない。デプロイ権限はPages workflowだけ付与する。公開設定・マージはユーザー操作。環境変数やAPIキーをViteのフロントエンドへ埋め込まない。モデルを含む静的ファイルだけを公開。

## PR #2 レビュー修正

- 記録名・登録方法は保存直前に画面から同期。解析済みの撮影角度・体の側はロックし、変更ボタンで表示中の解析を解除して再解析を要求する。元の保存記録は変更しない。
- 新アプリDB v2は `sessions`（個別詳細）と `summaries`（動画/Pose/rowsを持たない一覧）を分離。一覧・Good Form選択にはsummariesだけを読み、レビュー/書き出しで指定IDの詳細を取得。保存・削除は両storeを同じトランザクションで更新する。v1の更新はカーソルで1件ずつ概要を作成し、元の詳細を保持する。
- 比較スナップショットはid/名前、解析版・種目・撮影条件・検出率、最初のレップの4計測値のみ。全Pose、全rows、動画Blobは複製しない。旧保存スナップショットは読み込み/次回保存で軽量化する。
- pagehideで推論・動画・音声を止め、persisted=trueでは再生Blob URLを保持。キャッシュへ保存されない場合だけURLを破棄する。ChromiumではBFCacheのpagehide/pageshowイベントを模擬し、URLの取得と再生再開を確認。実際のiPhone Safariの戻る遷移、OSによるメモリ解放・大動画保存、撮影/音声の実機動作は未検証。
- Pagesはworkflow_dispatchのみ、main以外での手動実行はスキップ。手動公開のbuild job内で単体/ブラウザテスト・ビルドが全て通ってからartifactをアップロードし、deployはbuild成功に依存する。PRチェックと公開は別workflowだが、公開対象そのものを再検証する。workflowを実行したりmainへマージしたりはしていない。
