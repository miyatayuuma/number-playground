# よんでね — 家族交流機能の実装仕様

## 段階
- Phase 1: 3タブ「本棚／シリーズ／おすすめ」。家族設定はヘッダー。時期別表示は本棚の表示フィルタに統合。並び順は「最近読んだ順／最初に読んだ順／タイトル／作者／出版年（新しい順・古い順）」を1つの選択欄で指定。
- Phase 2: 書籍別のコメント・いいね・感想リクエスト・子どもの正式な感想表示。
- Phase 3: おすすめ本の投稿・リンク・理由・編集・取り下げ・同タイトルの画面統合。

## データの正本
Firebase project: `kodomo-reading-shelf-87f11`

- `families/{familyId}/books/{bookId}` 正式な書誌・読了記録。ブラウザから書込不可。
- `families/{familyId}/books/{bookId}/childReflections/{id}` 本人の言葉・保護者要約を区別した正式な感想。管理者のみアプリから追記可能、既存記録の修正・削除は不可。管理者ChatGPTの非公開同期からも追記可能。
- `families/{familyId}/books/{bookId}/comments/{id}` 家族コメント。作成者だけ本文編集・削除、管理者だけ非表示/復元。
- `families/{familyId}/books/{bookId}/reactions/{uid}` いいね。本人につき本ごと最大1ドキュメント。
- `families/{familyId}/books/{bookId}/requests/{uid}` 感想をききたい。本人につき本ごと最大1ドキュメント。子どもへの強制通知や未回答期限なし。
- `families/{familyId}/recommendations/{id}` おすすめ投稿。家族が自由投稿し、本人のみ編集・取り下げ可能。画面では正規化書名でまとめる。書籍台帳に自動追加しない。

書誌・読了情報は管理者のChatGPT → 非公開GitHub → OIDCサービスアカウント → Admin SDK によって登録する。子どもの正式な感想はこの同期に加え、管理者アプリからも追記する。家族コメントとおすすめは Firebase Authentication による本人確認のもとアプリから直接Firestoreへ保存する。

## プライバシー・セキュリティ
- Googleログイン済みの家族メンバーのみデータを閲覧・投稿。
- 書籍・シリーズは全ブラウザユーザーに書込禁止。子どもの正式な感想は管理者のみ新規追記可能で、全ブラウザユーザーによる既存感想の更新・削除は禁止。
- 投稿者本人の編集・削除のみ許可。管理者が他人の投稿本文を改ざんすることは不可。
- 管理者のみ投稿を非表示・復元可能。非表示の一覧は管理者専用でクエリを分離。
- リアクション・感想リクエストはUIDをドキュメントIDにし、なりすましをFirestore Rulesで拒否。
- 料金抑制のため、各書籍のコミュニティは詳細を開いている間だけ購読する。おすすめもタブ表示中のみ購読。1画面あたりの取得数は小さく制限。
- Firebase Storage、音声録音、写真投稿、外部課金API、プッシュ通知は使用しない。URLや自由入力文は文字列として扱う。
- ユーザー本人の意見（comments）と、親が保存する子どもの感想（childReflections）は別記録。

## 現行の制約
- 同一タイトルのおすすめはUI表示上で1枚にまとめる。全角半角・スペース等は正規化するが、別表記・別翻訳の同一作品を厳密に同定するものではない。
- おすすめ本はOpen Libraryの検索候補から任意で書誌を補完できるが、日本語書誌の品質は未検証。全文検索、録音ファイルの保存、アプリ外通知、全冊のコメント横断タイムラインは未実装。
- まだ本番デプロイされたことを保証しない。現行Firebaseは手動管理者承認による同時デプロイが必要。

## 検証
- `node --test domain.test.mjs pwa.test.mjs`
- `node --check` で app、book-community、recommendations、book-lookup、activity、owner-reflection、speech-dictation、sw の各モジュールを個別検査
- Firestore Emulator: `firebase emulators:exec --only firestore --project demo-reading-shelf-rules "node --test firestore.rules.test.mjs"`
- 本番公開後: Googleログイン、本棚とシリーズ件数、コメント投稿、本人編集、他人の編集拒否、管理者非表示、リアクション、感想リクエスト、おすすめ投稿、管理者感想追記・一般家族からの追記拒否・音声文字入力・家族活動反映、PWA再起動を実機受け入れする。引き継ぎ上の件数は29冊・読了22冊・シリーズ10件（Firestore実測は未確認）。

## 一括デプロイ
PR #37の対象ブランチでテストが通った後、権限のある管理者が既存Cloud Shellから実行する。

```bash
cd ~/reading-shelf-deploy/reading-shelf-firebase
git fetch origin feature/yondene-family-social
git switch -C feature/yondene-family-social --track origin/feature/yondene-family-social
firebase deploy --only hosting,firestore:rules --project kodomo-reading-shelf-87f11
```

本番反映は、書誌データの再インポートとは無関係。Firebase Rulesが旧版のままでは新しい投稿は失敗する。既存の books/series を削除・変更しない。

## 2026-10-16 高優先度UXの追加（high-v7）

### 1. 本棚のカード
表紙の下には「作品名・作者・読み方・読んだ時期」を優先表示する。
作品名と作者は識別、読み方と時期は子どもの読書体験を表すため。
出版年・対象学年・ISBN・出版社は削除せず本の詳細画面の展開式書誌情報に保持する。
読み方は実記録に `readingMode` がある場合に限り表示する。コードは `read-aloud` (読み聞かせ)、`independent` (自分で読んだ)、`mixed` (両方)。不明時に推測しない。
`books/{bookId}` は管理者ChatGPTからのみ編集。自力読書へ移行したことの観察があれば管理者が `readingMode` を更新する。

### 2. 最近の家族の活動
家族コメント、おすすめ、管理者が記録した子どもの感想について、本棚の冒頭に小さな時系列を表示する。
`families/{fid}/activity` に操作種別・対象の本・作成日時・投稿者UIDだけを保存する。
**コメント本文、子どもの発言、おすすめ理由、メールアドレスは複製しない。**
コメント・おすすめと活動情報は同一WriteBatchで作成し、削除・管理者の非表示にも連動する。
子どもの正式な感想は非公開GitHubのAdmin SDKトランザクションで活動情報も作成する。
`orderBy(createdAt, desc), limit(15)` だけを購読して、表示は最大5件。全書籍のコメントを常時購読しない。
**新機能追加後の投稿から記録を開始する。** 旧コメントを過去の新着として誤登録しない。

### 3. おすすめ本の任意の書誌検索
Open Library 公開書誌のタイトル検索を、家族が「書誌を検索」を押したときだけ呼び出す。
候補を表示し、家族が該当する版を明示的に選ぶ。検索結果を自動で確定しない。
採用した候補の著者・出版社・出版日・ISBN・参考表紙・外部出典URLをおすすめに追加保存する。
**検索が利用できなくても通常投稿できる。** 有料APIキー、Cloud Functions、Firebase Storage、写真アップロードは不要。
APIの利用可否・ネットワーク・検索精度・各表紙の表示は実機確認が必要。
無料公開APIの制限変更に依存するため、成功を恒久的に保証しない。

### 本番反映条件
- `hosting` **と `firestore:rules` の同時デプロイが必要**。新コレクションへのブラウザ書込権限を追加している。
- 既存書籍のデータ移行・再登録は不要。
- 自動CIがPASSしても、実機でコメント・おすすめ投稿・家族への反映・権限・Open Library 検索を確認するまで完全受入とはしない。
- ブラウザ書籍編集は禁止したまま。

## 2026-10-16 管理者による子どもの感想記録

- 本の詳細を開いたとき、管理者のGoogleアカウントだけ「子どもの感想を記録する」を展開できる。
- 記録は `childReflections` に追記し、`verbatim`（本人の言葉）と `parent-summary`（親の要約）を区別する。日時が曖昧なら観察時期を空欄で保存する。
- 他の家族は閲覧のみ。FireStore Rules で管理者以外の追記と、全クライアントによる既存記録の上書き・削除を拒否する。
- 感想本文は家族コメントへ複製しない。活動一覧には、内容を含めず新規感想の記録イベントだけを追加する。
- 対応するブラウザでは日本語SpeechRecognitionで入力欄への文字起こしが可能。**自動投稿しない**ので保護者が確認してから記録する。ブラウザによって使用不可の場合はキーボード音声入力を案内する。
- 録音ファイルのアップロードは未実装。Firebase Storageを導入する場合はSparkプラン無料運用との両立・同意/個人情報保護を別途判断する。
