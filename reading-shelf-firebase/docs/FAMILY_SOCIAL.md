# よんでね — 家族交流機能の実装仕様

## 段階
- Phase 1: 3タブ「本棚／シリーズ／おすすめ」。家族設定はヘッダー。時期別表示は本棚内トグル。ソートは「読んだ順・タイトル・作者・出版年」の4種と順序反転。
- Phase 2: 書籍別のコメント・いいね・感想リクエスト・子どもの正式な感想表示。
- Phase 3: おすすめ本の投稿・リンク・理由・編集・取り下げ・同タイトルの画面統合。

## データの正本
Firebase project: `kodomo-reading-shelf-87f11`

- `families/{familyId}/books/{bookId}` 正式な書誌・読了記録。ブラウザから書込不可。
- `families/{familyId}/books/{bookId}/childReflections/{id}` 本人の言葉・保護者要約を区別した正式な感想。ブラウザから書込不可。
- `families/{familyId}/books/{bookId}/comments/{id}` 家族コメント。作成者だけ本文編集・削除、管理者だけ非表示/復元。
- `families/{familyId}/books/{bookId}/reactions/{uid}` いいね。本人につき本ごと最大1ドキュメント。
- `families/{familyId}/books/{bookId}/requests/{uid}` 感想をききたい。本人につき本ごと最大1ドキュメント。子どもへの強制通知や未回答期限なし。
- `families/{familyId}/recommendations/{id}` おすすめ投稿。家族が自由投稿し、本人のみ編集・取り下げ可能。画面では正規化書名でまとめる。書籍台帳に自動追加しない。

書誌・読了情報・子どもの正式な感想だけ、管理者のChatGPT → 非公開GitHub → OIDCサービスアカウント → Admin SDK によって登録する。家族コメントとおすすめは Firebase Authentication による本人確認のもとアプリから直接Firestoreへ保存する。

## プライバシー・セキュリティ
- Googleログイン済みの家族メンバーのみデータを閲覧・投稿。
- 書籍・シリーズ・正式な感想は現行の全Webユーザーに書込禁止。管理者もブラウザでは編集不可。
- 投稿者本人の編集・削除のみ許可。管理者が他人の投稿本文を改ざんすることは不可。
- 管理者のみ投稿を非表示・復元可能。非表示の一覧は管理者専用でクエリを分離。
- リアクション・感想リクエストはUIDをドキュメントIDにし、なりすましをFirestore Rulesで拒否。
- 料金抑制のため、各書籍のコミュニティは詳細を開いている間だけ購読する。おすすめもタブ表示中のみ購読。1画面あたりの取得数は小さく制限。
- Firebase Storage、音声録音、写真投稿、外部課金API、プッシュ通知は使用しない。URLや自由入力文は文字列として扱う。
- ユーザー本人の意見（comments）と、親が保存する子どもの感想（childReflections）は別記録。

## 現行の制約
- 同一タイトルのおすすめはUI表示上で1枚にまとめる。全角半角・スペース等は正規化するが、別表記・別翻訳の同一作品を厳密に同定するものではない。
- 表紙の自動書誌補完、全文検索、音声メモ、アプリ外通知、全冊のコメント横断タイムラインは未実装。
- まだ本番デプロイされたことを保証しない。現行Firebaseは手動管理者承認による同時デプロイが必要。

## 検証
- `node --test domain.test.mjs pwa.test.mjs`
- `node --check app.mjs book-community.mjs recommendations.mjs sw.js`（実行時は各ファイルへ分割）
- Firestore Emulator: `firebase emulators:exec --only firestore --project demo-reading-shelf-rules "node --test firestore.rules.test.mjs"`
- 本番公開後: Googleログイン、27冊の表示、シリーズ集計、コメント投稿、本人編集、他人の編集拒否、管理者非表示、リアクション、感想リクエスト、おすすめ投稿、PWA再起動を実機受け入れする。

## 一括デプロイ
PR #37の対象ブランチでテストが通った後、権限のある管理者が既存Cloud Shellから実行する。

```bash
cd ~/reading-shelf-deploy/reading-shelf-firebase
git fetch origin feature/yondene-family-social
git switch -C feature/yondene-family-social --track origin/feature/yondene-family-social
firebase deploy --only hosting,firestore:rules --project kodomo-reading-shelf-87f11
```

本番反映は、書誌27冊の再インポートとは無関係。Firebase Rulesが旧版のままでは新しい投稿は失敗する。既存の books/series を削除・変更しない。
