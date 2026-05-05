# sheetcraft

ゲーム開発向けマスターデータ管理ツール。

ブラウザ上のGUIでスプレッドシートのようにデータを編集し、JSONファイルとしてGitで管理する。出力時はプロジェクトに合わせてJSON / Protocol Buffers / CSV / MessagePack を選択できる。

> **Status:** Phase 1 開発中 — ローカル編集ツール

## 特徴

- **ブラウザSPA** — サーバー不要、`index.html` を開くだけで動作
- **1ファイル = 1テーブル** — スキーマ定義とデータを同一JSONファイルに格納
- **型安全な編集** — enum、テーブル間参照、computed列をGUIが自動判別
- **セルのメタデータ** — 色分け、コメント、数式オーバーライドをセル単位で設定
- **バリデーション** — 入力制限（エラー）と異常値検知（警告）の2段階チェック
- **Git親和性** — 整形済みJSONでdiffが見やすく、PRレビューに最適
- **CLIツール** — CI/CDでバリデーション・エクスポートを自動実行

## アーキテクチャ

```
packages/
  core/    スキーマ解釈、バリデーション、数式エンジン（GUI/CLI共有）
  gui/     React + AG Grid（ブラウザSPA）
  cli/     Deno/Bun CLI
```

## マスターデータのフォルダ構成

ツールが管理するデータ側のフォルダ構造。

```
master/
  config/
    base_fields.json    全テーブル共通カラム（id, version）
    enums.json          共通enum定義
    cell_colors.json    セル色プリセット
    project.json        出力設定
  tables/
    character.json      テーブル定義 + データ
    skill.json
    quest.json
```

## テーブルファイルの例

```json
{
  "table": "character_master",
  "display_name": "キャラクター",
  "fields": [
    { "name": "name", "type": "string", "display_name": "名前", "required": true, "export": true },
    { "name": "hp", "type": "int", "display_name": "HP", "export": true, "validation": { "min": 1, "max": 99999 } },
    { "name": "rarity", "type": "enum", "display_name": "レアリティ", "enum_ref": "rarity", "export": true },
    { "name": "effective_hp", "type": "computed", "display_name": "実効HP", "formula": "hp * (1 + defense / 100)", "export": true },
    { "name": "dev_memo", "type": "string", "display_name": "開発メモ", "export": false }
  ],
  "records": [
    { "id": 1, "name": "勇者アルス", "rarity": "SSR", "hp": 1200 },
    { "id": 2, "name": "魔法使いリナ", "rarity": "SR", "hp": { "value": 800, "color": "red", "comment": "次回調整予定" } }
  ]
}
```

## セルの3状態

大多数のセルはプレーン値。メタデータが必要なセルだけオブジェクトに昇格する。

```json
// 通常
"hp": 1200

// メタデータ付き
"hp": { "value": 800, "color": "red", "comment": "調整予定" }

// computed列の式オーバーライド
"effective_hp": { "override": "hp * 2", "comment": "特殊計算" }
```

## CLI

```bash
masterdata-tool validate ./master                      # バリデーション
masterdata-tool export ./master -f json -o ./build     # JSON出力
masterdata-tool export ./master -f protobuf -o ./build # Protobuf出力
masterdata-tool new enemy_master                       # テーブル新規作成
```

## 開発

```bash
# monorepo セットアップ
npm install

# GUI 開発サーバー
npm run dev -w packages/gui

# core テスト
npm test -w packages/core

# CLI ビルド
npm run build -w packages/cli
```

## ロードマップ

### Phase 1: ローカル編集ツール（現在）

- GUI: AG Grid によるテーブル編集、バリデーション表示、セル色・コメント
- CLI: validate / export / new コマンド
- File System Access API でローカルJSON読み書き

### Phase 2: GitHub連携

- GitHub OAuth Device Flow による認証
- GUI上からcommit / branch作成 / PR作成
- GitHub APIによる差分表示

## ドキュメント

- [設計書](./docs/DESIGN.md) — アーキテクチャ、JSONフォーマット仕様、GUI仕様の詳細