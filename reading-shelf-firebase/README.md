# こどもの本棚 — Google認証・家族共有版

**ステージング用ブランチです。Firebaseの接続・検証までは従来の公開アプリを変更しません。**

## 技術構成
- Firebase Authentication: Google認証（ブラウザのログイン状態を維持）
- Cloud Firestore: 家族単位の読書記録と招待情報
- Security Rules: デフォルト拒否、メンバーのみ閲覧、owner/editorのみ編集
- Firebase Hosting: Firebase側のWebドメインから配信
- CDN Firebase Web SDK v12.19.0、バンドラ不要

## セットアップとデータ移行
1. https://console.firebase.google.com/ で専用Firebaseプロジェクトを作成。
2. Webアプリ (reading-shelf) を登録し、Firebase SDK構成値を firebase-config.mjs に登録。サービスアカウント鍵は不要・禁止。
3. Authentication → Sign-in method → Google を有効化。
4. Firestore Database を作成。設定時はロックモードを選択。デプロイするまで公開アクセスを許可しない。
4a. Hostingを初めて使う場合はFirebase ConsoleのHosting画面でサイトを作成。2026-10-15以降、新規Firebaseプロジェクトでは既定Hostingサイトが自動生成されない場合があります。
5. このディレクトリをFirebase CLIの作業ディレクトリとし、firebase deploy --only firestore:rules,hosting --project <PROJECT_ID> を実行。
6. Authentication → Settings → Authorized domains に実際に利用するHostingドメインが登録されているか確認。Hostingが発行したURLを開き、オーナーのGoogleアカウントでログインし家族の本棚を作成。
7. 旧版 https://miyatayuuma.github.io/number-playground/reading-shelf/ でJSONバックアップを取得。
8. 新版 → 家族の管理 → 旧アプリからJSONを取り込む。読了22冊・総数27冊・シリーズ8件を照合。
9. 管理者が家族のGoogleメールアドレスを入力し招待を作成。招待URLを家族に送信。
10. 相手は自分のGoogleアカウントでログインし招待を承認（14日以内）。
11. 実機でログイン保持・別端末同期・viewer編集拒否・未招待アカウントの拒否・保存後の再読込を確認。
12. 確認後、旧GitHubの個人アクセストークンを失効させ、旧版を読み取り専用化する。

## 権限
- owner：招待、権限管理、書籍追加編集、バックアップ、JSONインポート。
- editor：書籍追加編集、閲覧、バックアップ。
- viewer：閲覧とJSONバックアップのみ。
- 招待URLだけでは参加不可。招待先メールとGoogleログインアカウントが一致する必要あり。

## セキュリティ・運用
- firebase-config.mjs のapiKeyは公開用設定値であり認証秘密鍵ではない。データ保護はFirestoreルールによる。
- 読書履歴をWebサイトの公開資産に含めない。旧JSONは利用者端末から新しい非公開クラウドへ直接転送。
- Firestore移行は最大250件ずつバッチコミット。再実行は同一IDのドキュメントを上書き。
- ログイン維持はFirebase AuthのbrowserLocalPersistence。ログアウト等で再ログインが必要。
- プロジェクトID・HostingサイトIDは異なりうるため、実際に発行されたURLを利用する。
- メンバー削除後、既に端末に残ったオフラインキャッシュをリモートから確実に消せる保証はない。
- デプロイおよび実機E2EはFirebaseプロジェクト作成と接続完了後に行う。

## 単体テスト
node --test domain.test.mjs
Firestore Rulesのアクセス制御はFirebase Emulator上の権限テストが別途必要。
