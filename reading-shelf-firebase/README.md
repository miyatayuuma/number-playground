# よんでね — あおのほんだな (PWA)

URL: https://kodomo-reading-shelf-87f11.web.app

## 使い方

- 家族はGoogleアカウントでログインし、同じ「あおのほんだな」を閲覧する。
- 書籍の新規登録・読了・書誌修正・表紙変更・削除は、ChatGPTへの会話によってのみ行う。
- ブラウザの本棚には書籍の編集フォーム、追加ボタン、JSONの手動取込・書出し、シリーズ追加・本棚名変更フォームは**ない**。
- 家族の招待・アクセス解除は、管理者の「家族」タブに限り残す（書籍データではなくアクセス管理のため）。
- 家族以外は閲覧不可。通常ブラウザから books/series への create/update/delete は Firestore Rules で拒否される。
- Firestoreへ書くのは非公開 GitHub `miyatayuuma/legacy-games` から Workload Identity Federation 認証した Admin SDK 同期ジョブ。
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

Service Workerは同一オリジンの公開用静的ファイルだけをキャッシュする。
Firebase Firestore API、Googleログイン、外部書影、ユーザー読書データはキャッシュ対象にしない。
正しいサービスワーカーとmanifestが提供され、ブラウザのインストール条件を満たすかは実機検証が必要。
GitHub Actionsでデータ・UI・ルールの回帰テストを行う。
