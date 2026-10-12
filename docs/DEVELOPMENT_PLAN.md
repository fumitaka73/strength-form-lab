# Strength Form Lab — 開発計画・初期設定
更新日: 2026-10-12

## 目的
Personal Sports Form Lab の技術を再利用して、筋トレ専用の独立したWebアプリを作る。
最初の種目はルーマニアンデッドリフト（RDL）。将来はスクワット、ベンチプレスに拡張する。
優先端末はiPhone Safari。画面は日本語。初期版は端末内解析・保存を基本とする。

## 現在の確認結果
- 新リポジトリ fumitaka73/strength-form-lab は作成済み、public、mainあり。初期READMEのみ。
- 既存リポジトリはVite + JavaScript。package.jsonのバージョン表記は0.21.2。
- 姿勢推定の実装は @mediapipe/pose と window.Pose によるMediaPipe Pose Lite。Pose Landmarker Tasks APIではない。
- 元の保存先はIndexedDB sports-form-lab、バージョン4。
- GitHub Actionsにテスト・ビルド・Pagesデプロイがある。
- 新アプリの実装、Codex環境の登録、Pages設定はまだ完了していない。

## 技術方針
1. 別リポジトリ・別アプリとして管理する。既存アプリへ変更を加えない。
2. 最初に既存mainのコミットSHAを固定し、再利用元として記録する。
3. 依存関係を追って必要な部品だけ移植する。既存画面全体のコピーや大規模な共通ライブラリ化は初期範囲外。
4. 新しいIndexedDB名 strength-form-lab を使用する。同じfumitaka73.github.io配下のアプリはオリジンを共有するため、DB名だけでなくlocalStorageキー等も分離する。
5. ViteとJavaScriptを初期構成の候補とする。既存の相対base設定を参考に、/strength-form-lab/配下でモデル・WASM・動画が正常に読めるか確認する。
6. Pose Landmarkerへの移行を初期技術検証で比較する。iPhoneで推定速度・追跡安定性・メモリを測り、採用理由を記録する。両方のAPIを混在させない。
7. レップ検出、計測、参照比較、助言、保存、UIを分離し、種目ごとの設定と処理を追加できる構成にする。

## 再利用候補
|領域|既存ファイル候補|移植時の確認|
|---|---|---|
|姿勢推定|src/pose-engine.js, src/pose.js, scripts/copy-pose-assets.js|モデルAPI・アセット配布・iPhone性能|
|座標・計測|src/pose-coordinates.js, src/metrics.js, src/live-metrics.js|画像縦横比、左右、鏡像、2D/3Dの定義|
|動画レビュー|src/video-review.js, src/shot-playback.js, src/video-thumbnail.js|シュート固有依存を外しレップ区間へ変更|
|保存|src/storage.js, src/temporary-video.js, src/pose-archive.js|独立DB、容量不足、削除、エクスポート|
|参照比較|src/bone-comparison.js, src/reference-comparison-data.js|体格の正規化、フェーズ同期、撮影方向|
|フィードバック|src/coach-feedback.js, src/coach-voice.js|助言の優先順位、重複抑制、Safari音声|
|公開|.github/workflows/deploy-pages.yml, vite.config.js|新リポジトリ用CI・Pages設定|
ファイル名による候補であり、全件を移植可能と確認したものではない。ボール・Hoop・シュート判定は移植しない。

## 段階ごとの計画
|段階|できるようにすること|完了確認|
|---|---|---|
|0: 初期設定|計画、開発ルール、Codex接続|新リポジトリでPRを作りレビューできる|
|1: 技術検証|動画選択、再生、骨格表示、計測品質表示|本人のiPhone Safariで動画・モデル読み込みと解析が動く|
|2: RDL解析 MVP|レップ数、下降/ボトム/上昇、股関節・膝の推定角度、体幹傾斜、レップ別レビュー|実動画の手動カウント・区間と比較でき、修正できる|
|3: Good Form比較|承認済み参照レップ、フェーズ別比較、項目別の差と短い助言|同じ撮影方向の参照と比較でき、判定根拠を表示する|
|4: トレーナー反映|レップへのコメント、重要項目、評価修正、比較設定の版管理|保存、再読込、JSON書出し、設定の取消ができる|
|5: ライブ解析|カメラ、リアルタイムレップ数、レップ終了後の簡潔な音声|Safari実機で遅延・連続稼働・重複助言を確認する|
|6: 種目追加|スクワット、ベンチプレス|種目別の撮影条件・検出器・参照基準を検証する|
段階2〜4で撮影後レビューに使えるアプリを目指す。期間は段階1の実機検証後に見積もる。

## RDL MVPの仕様案
- 横から全身が見える撮影を基本に、撮影例と品質表示を出す。
- 肩・股関節・膝の推定角度、股関節・膝・足首の推定角度、体幹傾斜を計測する。角度の定義と使用側を明記する。
- 股関節角度の時系列等から、準備→下降→ボトム→上昇→終了を検出する。ヒステリシス、最小継続時間、欠損処理で二重カウントを抑える。
- 途中から始まった動作、停止、浅い動作、準備動作を含む動画を検証し、不完全レップを完了レップと区別する。
- 低確度の区間は判定保留にし、レップ追加・削除・区間修正を可能にする。
- タイムライン上のレップ位置から、そのレップの動画・角度・助言にアクセスする。
- 初期助言は一レップ一つの主要ポイント。「参照より膝の曲がりが大きい」など、実際に計測できた内容に限定する。
- Poseの肩と股関節だけで腰椎の丸まりを直接測定したとは扱わない。バー位置・腰の局所形状・筋肉への効きは別の検証が必要。
- 総合点や「正しさ○%」はMVPの必須項目にしない。Good Formとの類似度、検出品質、トレーナー評価を分ける。

## Good Formとトレーナーの反映
- ユーザーが選び、トレーナーが確認したレップを参照にする。自分の良いレップを優先候補とする。
- 動画速度ではなく動作フェーズを合わせ、身長等による座標差を正規化する。
- 初期はコメントと修正ラベルの保存。次に確認済みのルール・重み・許容差を版管理して適用する。
- コメントを保存しただけでモデルが自動学習したと表示しない。再解析時に使用した設定版を記録する。
- 撮影角度が異なる参照、関節が見えない区間は比較を保留する。

## 検証方法
- 合成ランドマークで、正常レップ、途中動作、停止、欠損、揺れ、左右切替を単体検証する。
- 実動画で各レップの手動開始・ボトム・終了を記録して比較する。合計数だけでなく過検出と見逃しも確認する。
- 暫定リリース目標: 手動で明確に判定できる複数動画でレップ適合率・再現率各90%以上。サンプル数、対象条件、失敗例を併記する。少数動画で一般的な精度を断定しない。
- Safari実機: MOV/MP4再生可否、playsinline、選択動画の向き、モデル読み込み、長い動画のメモリ、画面復帰、保存容量不足、動画DL/共有を確認する。
- npm test / npm run buildが成功してもSafari実機確認済みとは扱わない。

## GitHub / Codex初期設定
1. この計画PRをレビューし、問題がなければmainへマージする。
2. WebまたはデスクトップのChatGPTから Work in > Cloud > Select environment > Create environment を開く。モバイルは既存環境選択に対応するため、新規環境作成はWeb/デスクトップで行う。
3. GitHubリポジトリにstrength-form-labを選ぶ。参照元コードも読めるようpersonal-sports-form-labへのアクセスを用意する。既存側は変更対象にしない。
4. 新リポジトリが出ない場合はGitHub連携の対象リポジトリに追加し、一覧を更新する。
5. Codexが準備した環境とチェック結果を確認してPublishし、Environment publishedを待つ。このPublishは開発環境の公開で、アプリのPages公開とは別。
6. 初回は下の指示で段階1までを依頼する。まだpackage.jsonがない段階でnpm ciを強制しない。足場ができた後、lockfileに基づきnpm ci / npm test / npm run buildを標準にする。

## 最初のCodexへの指示
以下を新リポジトリを選択したCodexに渡す。

> Strength Form Labの段階1（RDL解析の技術検証）を実装してください。
> 最初にAGENTS.mdとdocs/DEVELOPMENT_PLAN.mdを読み、fumitaka73/strength-form-labだけを変更してください。
> fumitaka73/personal-sports-form-labのmainを読み取り、参照元コミットSHAと再利用ファイルを記録してください。アクセスできない場合は、参照できなかった事実を報告し、既存実装を確認したと主張しないでください。
> 既存のVite/JavaScriptと動画処理を参考に、iPhone Safari向けに「動画を選択→再生→MediaPipe骨格表示→推定股関節角度・膝角度・体幹傾斜と検出品質の表示」を実装してください。
> 既存は@mediapipe/poseです。Pose Landmarker Tasks APIとの採用判断を説明し、採用方式を一つに決めてください。
> 初回はレップ採点・自動学習・ライブ音声まで広げないでください。端末内解析を基本に、strength-form-lab専用の保存名・キーを使ってください。
> 関節欠損は判定保留、動画読込失敗は日本語で再試行可能にしてください。長い動画を一括展開しないでください。
> mainとは別の作業ブランチで実装し、意味のあるテストとビルドを実行してください。PRのチェック用CIを作成し、mainへマージしないでください。
> PRには変更内容、実行した検証、iPhone実機で未確認の項目、確認手順を日本語で記載してください。Pages用設定案を準備し、自動デプロイ有効化は初回実機確認と公開判断の後に行ってください。

## PRから公開まで
- PR = mainへ取り込む変更提案。まず差分・検証結果・目的との一致をレビューする。
- このチャットにPRのURLを渡すと、コードとチェック状況を確認する。修正が必要ならCodexへ具体的な修正指示を出す。
- マージ依頼を受けたら対象PRの最新コミットとチェックを確認してマージする。
- 初回のアプリPRでGitHub ActionsによるビルドとPages用成果物を用意する。
- 公開するときはGitHubの Settings > Pages > Build and deployment > Source を GitHub Actionsに設定する。
- 初回デプロイ成功後に表示されたURLで確認する。予定URLは https://fumitaka73.github.io/strength-form-lab/ （未公開）。
- 以後mainへのマージを自動デプロイの契機にできる。CI失敗時には公開しない構成にする。
- 元動画・個人の参照データ・トレーナーの個人情報をpublicリポジトリへコミットしない。

## 参考
- https://github.com/fumitaka73/personal-sports-form-lab
- https://learn.chatgpt.com/docs/cloud
- https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
