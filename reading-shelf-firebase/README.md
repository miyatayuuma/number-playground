# よんでね — あおのほんだな (PWA)

URL: https://kodomo-reading-shelf-87f11.web.app

## 使い方

- 家族はGoogleアカウントでログインし、同じ「あおのほんだな」を閲覧する。
- 書籍の新規登録・読了・書誌修正・表紙変更・削除は、ChatGPTへの会話によってのみ行う。
- ブラウザの本棚には書籍の編集フォーム、追加ボタン、JSONの手動取込・書出し、シリーズ追加・本棚名変更フォームは**ない**。
- 家族の招待・アクセス解除は、管理者の右上「家族の設定」画面に限り残す（書籍データではなくアクセス管理のため）。
- 家族以外は閲覧不可。通常ブラウザから books/series への create/update/delete は Firestore Rules で拒否される。
- 書誌・読了履歴・子どもの正式な感想は、非公開 GitHub `miyatayuuma/legacy-games` から Workload Identity Federation 認証した Admin SDK 同期ジョブで書き込む。家族のコメント・リアクション・おすすめ投稿は、ログイン済み本人がアプリからFirestoreへ直接書き込む。
- 本棚名は「あおのほんだな」、ホーム画面のアプリ名は「よんでね」。既存の「みてね」と同一の商標・ロゴ画像は使わない。

## インストール

Android / Brave・Chromeで https://kodomo-reading-shelf-87f11.web.app を開く。
ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選ぶ。
ブラウザの対応や設定によって文言と表示は異なる。
iPhone / Safariでは共有メニューから「ホーム画面に追加」。
PWAアイコンは独自の2色の本。192×192、512×512 PNGとSVGを同梱。
Firebaseのネットワーク通信は必要。オフライン書誌閲覧を保証しない。

## 初回デプロイ

管理者の既存Cloud Shellの作業ディレクトリから、最新版を取得して **HostingとFirestore Security Rulesを同時にデプロイ**:

```bash
cd ~/reading-shelf-deploy/reading-shelf-firebase && git pull --ff-only origin feature/reading-shelf-family-firebase && firebase deploy --only hosting,firestore:rules --project kodomo-reading-shelf-87f11
```

Firestore RulesによりWebブラウザからの書籍書込みは即座に拒否される。
この変更はすでに稼働中のGoogle Cloud IAMのAdmin SDK同期には適用されない。
デプロイ後、27冊・読了22冊・シリーズ8件の確認、表紙/詳細表示、アプリのインストール、端末再起動後ログイン、書籍編集UIが存在しないことを確認する。

## プライバシー・更新

Service Workerはアイコンとmanifestのみをキャッシュする。HTML/JavaScript/CSSはキャッシュせず、ネットワークから最新版を取得する。
Firebase Firestore API、Googleログイン、外部書影、ユーザー読書データはキャッシュ対象にしない。
正しいサービスワーカーとmanifestが提供され、ブラウザのインストール条件を満たすかは実機検証が必要。
GitHub Actionsでデータ・UI・ルールの回帰テストを行う。

## 2026-10-16 PWA画面更新の不整合修復

家族交流の新版公開後、旧JavaScriptが廃止済みのDOM IDを操作し、`Cannot set properties of null (setting 'textContent')` を表示した可能性がある。
新旧HTMLとJSを混在させないため、Service Workerは画像アイコンとmanifestのみ保存し、HTML・JavaScript・CSSはキャッシュしない。
Firebase Hosting側でもこれらの配信に `Cache-Control: no-store` を指定した。

既存の`feature/yondene-family-social`ローカルブランチにいるCloud Shellでは、最新版を取り込んでHostingのみ更新する。

```bash
cd ~/reading-shelf-deploy/reading-shelf-firebase && git fetch origin feature/yondene-family-social && git switch feature/yondene-family-social && git merge --ff-only FETCH_HEAD && firebase deploy --only hosting --project kodomo-reading-shelf-87f11
```

アプリを完全終了して再起動後、赤いエラーが消えることと、読書記録27冊、シリーズ、詳細ページのコメントを確認する。修復にFirestoreデータ移行、ユーザーログアウト、PWAの削除は不要。
