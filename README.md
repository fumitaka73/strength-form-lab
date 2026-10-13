# Strength Form Lab

iPhone Safariを優先した、端末内処理のRDLフォームレビューMVP。動画撮影/選択、MediaPipeの骨格表示、2D角度、レップ候補、Good Formとの差、スロー再生、タイムライン、音声、IndexedDB履歴とメモを提供します。

[既存アプリの調査・再利用方針・MVP・Pages設計](docs/architecture-and-mvp.md)

## 開発

Node.js 24（検証: 24.19.0）、npm 11。

```sh
npm ci
npm run dev
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

既存Chromiumを利用する場合は `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`。クラウドのnpmキャッシュに書き込めない場合は `npm ci --cache /workspace/.npm-cache`。モデル/WASMはpostinstall/build時にpublic/poseへコピーし同じサイトから配信します。APIキー・ログイン・動画の外部送信はありません。

## 利用

1. 真横から1人の全身（肩・股関節・膝・足首）が入る固定動画を撮影/選択。2分、100MB以内。
2. 見える体の側を指定し、練習またはGood Formを選び「RDLを分析」。撮影にはSafariのネイティブ動画撮影を利用します。アプリ内ライブ撮影・ライブコーチは未対応。
3. 候補本数を映像で確認。各レップの最下点/区間再生、0.5/0.25倍速、角度を確認。同じ条件のGood Formがあれば最初の完成レップとの差を表示。
4. レビューを記入して「端末に保存」。履歴から再確認・メモ更新・動画書き出し・個別削除が可能です。

Good Formは自動で正しいフォームと認定しません。基準登録前に本人/指導者が確認してください。基準は保存時の解析スナップショットとして保持し、その後基準を削除しても過去の差を再表示できます。

## 限界とデータ保護

新DB `strength-form-lab` v2。既存DB `sports-form-lab` は開かず、既存動画・Pose・履歴を移行/削除しません。GitHub Pagesのリポジトリパスが違っても同じオリジンであるため、DB名で分離します。新アプリの削除は選択した記録だけが対象です。ブラウザのデータ消去/容量不足でデータが失われる可能性があるため、元動画を保管してください。完全なPose/評価バックアップは今後対応。

2Dの股関節角度・膝角度・体幹線の傾き・可動域を計測する参考ツールです。背骨形状、腰の反り、重量の適否や傷害リスクを断定しません。正面・斜めは自動判定を保留し、欠測はレップを分断します。RDLの実動画で精度検証をしていない暫定検出です。外部LLM・本人レビューによる学習・スクワット・ベンチプレス・同期2画面比較は未対応。音声は画面の参考結果をブラウザ音声合成で読み上げます。

## GitHub Pages

Settings → Pages → Source を **GitHub Actions** に設定。PRではテスト/ビルド/Chromiumテストを実行。ユーザーが初回公開を判断した後、mainを対象にPages workflowを手動実行します。公開前にも単体/ブラウザテストとビルドを再実行し、失敗時は公開しません。相対baseなのでプロジェクトパスに対応します。PRブランチから公開せず、自動マージしません。フロントエンドにAPIキーを置かないでください。

## 検証範囲

Nodeテストはレップ状態遷移・欠測・不完全レップ・座標補正・比較条件・別DBの保持を検証。ブラウザテストはiPhone幅のUI、MP4再生、速度・最下点、メモ/基準スナップショット復元、個別削除、実MediaPipeで人物なしの動画分析を検証。比較の姿勢/角度は合成fixtureです。人のRDL認識精度・物理iPhone Safari・音声の実機再生は別途確認が必要です。

## 移植元

`fumitaka73/personal-sports-form-lab` main `4f348045c0a8ea38c4d6d81fb4bda89a4fbb0ea2` の `pose-engine.js`、`pose-coordinates.js`、`coach-voice.js`、`copy-pose-assets.js` を再利用。元アプリに変更していません。シュート検出器・バスケットボール評価基準は使用していません。

## 撮影なしのトレーニング記録（v0.4.0）

履歴タブから日付・種目・重量・回数・セット数を入力し、セット単位で編集/削除できます。日別/種目別の推移表と総負荷量を表示。動画を撮らずに完結します。動画候補は自動計上せず、任意の関連付けでも回数は本人が入力します。DB v3への更新は新しいworkoutSetsだけを追加し、既存のsessions/summariesを保持します。[保存影響・iPhone確認手順](docs/issue-7-workouts.md)。
