# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

ゲーム開発向けマスターデータ管理ツール。ブラウザSPA（React + AG Grid）でスプレッドシート風にデータを編集し、JSONファイルとしてGit管理する。

## コマンド

```bash
# 依存関係インストール
pnpm install

# GUI 開発サーバー
pnpm dev

# 全パッケージビルド
pnpm build

# 全パッケージテスト
pnpm test

# 特定パッケージのテスト
pnpm -F core test
pnpm -F core test -- --run src/path/to/file.test.ts  # 単一ファイル

# lint / format
pnpm lint
pnpm format
```

## アーキテクチャ

```
packages/
  core/   スキーマ解釈・バリデーション・数式エンジン（GUI/CLI共有）
  gui/    React + AG Grid ブラウザSPA（File System Access API）
  cli/    Bun CLI（validate / export / new コマンド）
```

`core` はGUIとCLIの両方から参照するため、ブラウザ・Node・Bun 全環境で動く純粋なTypeScriptのみで実装する。

## データモデル

1ファイル = 1テーブル。スキーマ定義（fields）とデータ（records）を同一JSONに格納する。

**セルの3状態:**
- `SimpleCell` — プレーン値（`"hp": 1200`）
- `RichCell` — メタデータ付き（`"hp": { "value": 800, "color": "red", "comment": "..." }`）
- `ComputedCell` — 数式オーバーライドまたは固定値（`"effective_hp": { "override": "hp * 2" }`）

computed列でオーバーライドなし → キー自体を省略（diffを汚さないため）。

## Gitブランチ運用

- `develop` がデフォルトブランチ
- 作業は `develop` からfeatureブランチを切って実施し、PRで `develop` にマージ

## ツール設定

- **Biome** — linter + formatter（ESLint / Prettier の代替）、設定は `biome.json`
- **TypeScript** — 共通設定は `tsconfig.base.json`、各パッケージが extends して使用
- **pnpm workspaces** — `pnpm-workspace.yaml` で `packages/*` を管理
