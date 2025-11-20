# FullStackSample

メール＋パスワード認証機能を持つフルスタックWebアプリケーションのサンプルです。

## プロジェクト概要

- **名前**: FullStackSample
- **目的**: Cloudflare Pages + Hono + D1を使用したモダンな認証システムの実装例
- **主な機能**:
  - メールアドレスとパスワードによるユーザー登録
  - ログイン/ログアウト機能
  - セッション管理（Cookie-based）
  - 保護されたページ（認証必須）
  - パスワードハッシュ化（PBKDF2 with SHA-256）

## 公開URL

- **本番環境（Cloudflare Pages）**: https://e55aac0b.fullstacksample.pages.dev
- **本番URL（カスタムドメイン）**: https://fullstacksample.pages.dev
- **開発環境**: https://3000-irblmdlre6djbqg06auob-5c13a017.sandbox.novita.ai

## 技術スタック

- **フレームワーク**: Hono v4
- **デプロイ先**: Cloudflare Pages Functions
- **データベース**: Cloudflare D1（SQLite）
- **認証**: カスタム実装（セッション管理）
- **パスワードハッシュ**: Web Crypto API (PBKDF2)
- **フロントエンド**: TailwindCSS (CDN)
- **開発環境**: Wrangler, PM2

## データアーキテクチャ

### データモデル

**Users テーブル**:
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

**Sessions テーブル**:
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### ストレージサービス

- **Cloudflare D1**: ユーザー情報とセッション情報の永続化
- **Cookie**: セッションIDの保存（HttpOnly, Secure, SameSite=Lax）

### データフロー

1. **新規登録**: email/password → パスワードハッシュ化 → D1に保存 → セッション作成 → Cookie設定
2. **ログイン**: email/password → D1から取得 → パスワード検証 → セッション作成 → Cookie設定
3. **保護ページアクセス**: Cookie確認 → セッション検証 → ユーザー情報取得 → ページ表示
4. **ログアウト**: セッション削除 → Cookie削除

## 主な機能エントリーポイント

### ページ

| パス | 説明 | 認証 |
|------|------|------|
| `/` | ログインページ | 不要 |
| `/register` | 新規登録ページ | 不要 |
| `/protected` | 保護されたページ | 必要 |

### API エンドポイント

| メソッド | パス | 説明 | パラメータ |
|---------|------|------|-----------|
| POST | `/api/register` | 新規ユーザー登録 | `{ email, password }` |
| POST | `/api/login` | ログイン | `{ email, password }` |
| POST | `/api/logout` | ログアウト | なし |
| GET | `/api/user` | 現在のユーザー情報取得 | なし（Cookie） |

### セキュリティ機能

- **パスワードハッシュ化**: PBKDF2（100,000回イテレーション）
- **セッション有効期限**: 30日間
- **自動セッション延長**: 期限の15日前になると自動延長
- **Cookie設定**: HttpOnly, Secure, SameSite=Lax
- **入力バリデーション**: メールアドレス形式、パスワード長（8文字以上）

## ユーザーガイド

### アカウント作成

1. トップページ `/` から「アカウントを作成する」リンクをクリック
2. メールアドレスとパスワード（8文字以上）を入力
3. 「登録」ボタンをクリック
4. 自動的に保護ページ `/protected` にリダイレクト

### ログイン

1. トップページ `/` でメールアドレスとパスワードを入力
2. 「ログイン」ボタンをクリック
3. 認証成功後、保護ページ `/protected` にリダイレクト

### ログアウト

1. 保護ページ `/protected` で「ログアウト」ボタンをクリック
2. 自動的にトップページ `/` にリダイレクト

## 開発環境セットアップ

### 前提条件

- Node.js 18以上
- npm
- Wrangler CLI

### インストール

```bash
git clone <repository-url>
cd FullStackSample
npm install
```

### ローカル開発

```bash
# データベースマイグレーション適用
npm run db:migrate:local

# ビルド
npm run build

# 開発サーバー起動（PM2使用）
pm2 start ecosystem.config.cjs

# サーバー確認
curl http://localhost:3000
```

### その他の便利なコマンド

```bash
# ローカルD1データベースをリセット
npm run db:reset

# D1データベースにクエリ実行
npm run db:console:local

# PM2ログ確認
pm2 logs fullstacksample --nostream

# PM2プロセス一覧
pm2 list

# PM2プロセス停止
pm2 delete fullstacksample

# ポートクリーンアップ
npm run clean-port
```

## Cloudflare Pagesへのデプロイ

### 前提条件

- Cloudflare アカウント
- Cloudflare API Token（D1アクセス権限付き）

### デプロイ手順

1. **Cloudflare D1データベース作成**（初回のみ）:
```bash
npx wrangler d1 create fullstacksample-production
```

2. **wrangler.jsonc にdatabase_idを設定**:
```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "fullstacksample-production",
      "database_id": "ここに実際のdatabase_idを設定"
    }
  ]
}
```

3. **本番データベースにマイグレーション適用**:
```bash
npm run db:migrate:prod
```

4. **Cloudflare Pagesプロジェクト作成**:
```bash
npx wrangler pages project create fullstacksample \
  --production-branch main \
  --compatibility-date 2025-11-20
```

5. **デプロイ**:
```bash
npm run deploy:prod
```

### デプロイ後の確認

```bash
# 本番URLを確認
curl https://fullstacksample.pages.dev

# 本番データベース確認
npm run db:console:prod
```

## プロジェクト構造

```
FullStackSample/
├── src/
│   ├── index.tsx                 # メインアプリケーション
│   ├── lib/
│   │   ├── password.ts           # パスワードハッシュ化
│   │   ├── session.ts            # セッション管理
│   │   └── validation.ts         # 入力バリデーション
│   └── renderer.tsx              # （未使用）
├── migrations/
│   └── 0001_initial_schema.sql   # データベーススキーマ
├── public/
│   └── static/
│       └── style.css             # カスタムCSS
├── dist/                         # ビルド出力
├── .wrangler/                    # ローカルD1データベース
├── ecosystem.config.cjs          # PM2設定
├── wrangler.jsonc                # Cloudflare設定
├── package.json                  # 依存関係とスクリプト
└── README.md                     # このファイル
```

## 未実装機能

- メール確認機能
- パスワードリセット機能
- ソーシャルログイン（Google, GitHub等）
- 2要素認証
- ユーザープロフィール編集
- 管理者ダッシュボード
- WebAuthn/パスキー対応

## 推奨する次のステップ

1. **メール確認機能の追加**: 登録時にメール確認を要求
2. **パスワードリセット**: メールでのパスワードリセット機能
3. **プロフィール編集**: ユーザー情報の更新機能
4. **ソーシャルログイン**: OAuth2.0による外部サービス連携
5. **エラーハンドリング強化**: より詳細なエラーメッセージとログ
6. **レート制限**: API呼び出しのレート制限実装
7. **テスト**: ユニットテストとE2Eテストの追加

## デプロイ状況

- **プラットフォーム**: Cloudflare Pages
- **ステータス**: ✅ 本番デプロイ済み
- **本番URL**: https://e55aac0b.fullstacksample.pages.dev
- **データベース**: Cloudflare D1（本番環境）
- **最終更新**: 2025-11-20

## ライセンス

MIT

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。
