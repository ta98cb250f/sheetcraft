# 設計書

## 1. コンセプト

ゲーム開発におけるマスターデータを、GUIで直感的に編集し、JSONで管理し、複数フォーマットで出力するツール。

### 設計原則

- **データはJSONファイルとしてGitで管理する** — ブランチ、差分、PRレビューが自然に使える
- **1ファイル = 1テーブル** — スキーマ定義とデータを同一ファイルに格納する
- **GUIはブラウザSPA** — サーバー不要、ローカルファイルを直接読み書きする
- **ロジック（バリデーション・数式）はGUIとCLIで共有する** — 結果の不一致を防ぐ
- **段階的に拡張する** — まずローカル完結、後からGitHub連携を追加

### 開発フェーズ

|フェーズ       |スコープ     |ファイルアクセス              |Git操作                       |
|-----------|---------|----------------------|----------------------------|
|Phase 1（現在）|ローカル編集ツール|File System Access API|ユーザーが外部で実施（CLI / VS Code等）  |
|Phase 2    |GitHub連携 |GitHub Contents API   |GUI上からcommit / branch / PR作成|

Phase 1で編集体験を固め、Phase 2でGitHub API（OAuth Device Flow）を載せてプランナーがGUIだけで完結できるようにする。

-----

## 2. アーキテクチャ

### ディレクトリ構成（ツール側）

```
masterdata-tool/
  packages/
    core/         # スキーマ解釈、バリデーション、数式エンジン（共有）
    gui/          # React + AG Grid（ブラウザSPA）
    cli/          # Deno/Bun CLI
```

### Phase 1: ローカル編集ツール（現在のスコープ）

```
┌─────────────────────────────────────┐
│  ブラウザSPA                          │
│  React + AG Grid                     │
│    ├── File System Access API        │
│    │     ローカルJSON直接読み書き       │
│    ├── core (バリデーション / 数式)     │
│    └── JSON.parse / JSON.stringify   │
└─────────────────────────────────────┘

CLIツール (別途)
  ├── validate   CI用バリデーション
  ├── export     JSON / Protobuf 出力
  └── new        テーブル新規作成
```

Git操作（commit, push, branch）はユーザーが外部ツール（ターミナル / VS Code / SourceTree等）で行う。

### Phase 2: GitHub連携（将来拡張）

```
┌──────────────────────────────────────────────┐
│  ブラウザSPA                                    │
│  React + AG Grid                               │
│    ├── GitHub API (REST v3)                    │
│    │     Contents API  → ファイル読み書き         │
│    │     Trees/Blobs   → 複数ファイル一括コミット  │
│    │     Branches API  → ブランチ作成・切り替え    │
│    │     Pull Requests → PR作成                 │
│    │     Compare API   → 差分表示               │
│    ├── GitHub OAuth Device Flow (認証)          │
│    │     client_secret 不要、サーバー不要         │
│    ├── core (バリデーション / 数式)               │
│    └── JSON.parse / JSON.stringify             │
└──────────────────────────────────────────────┘
```

Phase 2ではFile System Access APIからGitHub APIに切り替わり、ファイルの実体はGitHubリポジトリに存在する形になる。ローカルファイル操作はPhase 1互換として残す。

#### GitHub OAuth Device Flow（認証）

```
1. ユーザーがGUI上で「GitHubログイン」を押す
2. デバイスコードが発行される
3. ユーザーが github.com/login/device でコードを入力
4. ブラウザがポーリングしてアクセストークンを取得
```

- client_id のみで動作（公開して問題ない）
- サーバー不要でトークン取得可能
- スコープは `repo` のみに制限
- トークンはブラウザのメモリ上のみ保持（永続化しない）
- レート制限: 認証済みで5,000リクエスト/時

### CLI

```bash
masterdata-tool validate ./master                      # バリデーション（CI用）
masterdata-tool export ./master -f json -o ./build     # エクスポート
masterdata-tool export ./master -f protobuf -o ./build
masterdata-tool new enemy_master                       # テーブル新規作成
masterdata-tool diff ./master                          # テーブル差分表示
```

### 共有ロジック（core）

GUIとCLIの両方から参照するTypeScriptパッケージ。

- スキーマパーサー
- バリデーションエンジン（validation / anomaly）
- 数式エンジン
- JSONシリアライザ / デシリアライザ
- エクスポーター（JSON / Protocol Buffers / CSV / MessagePack）

-----

## 3. マスターデータのファイル構成

ツールが管理対象とするマスターデータのフォルダ構造。

```
master/
  config/
    base_fields.json       # 全テーブル共通の基本カラム定義
    enums.json             # 共通enum定義
    cell_colors.json       # セル色のプリセット定義
    project.json           # プロジェクト設定（出力形式等）
  tables/
    character.json         # テーブル定義 + データ
    skill.json
    quest.json
    enemy.json
```

-----

## 4. JSONフォーマット仕様

### 4.1 共通設定

#### base_fields.json — 基本カラム（全テーブルに自動付与）

```json
{
  "base_fields": [
    {
      "name": "id",
      "type": "int",
      "primary": true,
      "editable": false,
      "auto": "increment",
      "export": true
    },
    {
      "name": "version",
      "type": "int",
      "editable": false,
      "auto": "timestamp_version",
      "export": true
    }
  ]
}
```

#### enums.json — 共通enum定義

```json
{
  "enums": {
    "rarity": {
      "display_name": "レアリティ",
      "values": ["N", "R", "SR", "SSR"]
    },
    "element": {
      "display_name": "属性",
      "values": ["火", "水", "木", "光", "闇"]
    }
  }
}
```

#### cell_colors.json — セル色プリセット

```json
{
  "cell_colors": {
    "red":    { "hex": "#FF6B6B", "label": "要修正" },
    "yellow": { "hex": "#FFD93D", "label": "確認中" },
    "blue":   { "hex": "#6BCB77", "label": "仮置き" },
    "green":  { "hex": "#4D96FF", "label": "確定済" }
  }
}
```

#### project.json — プロジェクト設定

```json
{
  "output": {
    "format": "protobuf",
    "options": {
      "package": "com.example.game",
      "optimize_for": "SPEED"
    },
    "out_dir": "./build"
  }
}
```

### 4.2 テーブルファイル

1ファイルにスキーマ定義（fields）とデータ（records）を格納する。

```json
{
  "table": "character_master",
  "display_name": "キャラクター",

  "fields": [
    {
      "name": "name",
      "type": "string",
      "display_name": "名前",
      "required": true,
      "export": true,
      "validation": {
        "max_length": 32,
        "unique": true
      }
    },
    {
      "name": "rarity",
      "type": "enum",
      "display_name": "レアリティ",
      "enum_ref": "rarity",
      "export": true
    },
    {
      "name": "hp",
      "type": "int",
      "display_name": "HP",
      "export": true,
      "validation": {
        "min": 1,
        "max": 99999
      },
      "anomaly": {
        "warn_above": 10000,
        "warn_below": 50,
        "warn_deviation": 2.0
      }
    },
    {
      "name": "defense",
      "type": "int",
      "display_name": "防御力",
      "export": true,
      "validation": {
        "min": 0,
        "max": 9999
      }
    },
    {
      "name": "skill_ids",
      "type": "list<int>",
      "display_name": "スキル",
      "ref": "skill_master.id",
      "export": true,
      "validation": {
        "max_length": 3
      }
    },
    {
      "name": "effective_hp",
      "type": "computed",
      "display_name": "実効HP",
      "formula": "hp * (1 + defense / 100)",
      "export": true
    },
    {
      "name": "dev_memo",
      "type": "string",
      "display_name": "開発メモ",
      "export": false
    }
  ],

  "records": [
    {
      "id": 1,
      "name": "勇者アルス",
      "rarity": "SSR",
      "hp": 1200,
      "defense": 50,
      "skill_ids": [1, 3, 7]
    },
    {
      "id": 2,
      "name": "魔法使いリナ",
      "rarity": "SR",
      "hp": {
        "value": 800,
        "color": "red",
        "comment": "次回バランス調整で1000に変更予定"
      },
      "defense": 30,
      "skill_ids": [2, 5]
    },
    {
      "id": 3,
      "name": "盾の騎士ガルド",
      "rarity": "SSR",
      "hp": 1500,
      "defense": {
        "value": 80,
        "color": "yellow",
        "comment": "QAから硬すぎると報告あり #1234"
      },
      "skill_ids": [1, 4],
      "effective_hp": {
        "override": "hp * 2",
        "color": "blue",
        "comment": "特殊計算：イベント限定仕様"
      }
    }
  ]
}
```

-----

## 5. セルのデータモデル

### 5.1 セルの状態

セルは以下の3種類のいずれかで表現される。

**SimpleCell**（大多数のセルはこれ）

```json
"hp": 1200
```

**RichCell**（メタデータ付き）

```json
"hp": {
  "value": 800,
  "color": "red",
  "comment": "調整予定"
}
```

**ComputedCell**（computed列のセル）

```json
// 列のデフォルト式に従う場合 → フィールド自体を省略

// 式オーバーライド
"effective_hp": {
  "override": "hp * 2"
}

// 固定値
"effective_hp": {
  "value": 9999
}
```

### 5.2 型定義

```typescript
type SimpleCell = number | string | boolean

type RichCell = {
  // 値（いずれか一つ、またはなし = 列の式に従う）
  value?: number | string | boolean
  override?: string                     // 式上書き（computed列のみ）

  // メタデータ（全て任意）
  color?: string                        // cell_colors のキー
  comment?: string
}

type Cell = SimpleCell | RichCell

// 判定: typeof cell === 'object' && cell !== null → RichCell
```

### 5.3 保存ルール

- メタデータなし → プレーン値のまま保存（diffを汚さない）
- メタデータあり → オブジェクト形式に昇格
- computed列でオーバーライドなし → キー自体を省略

-----

## 6. フィールド型一覧

|type          |GUI入力         |備考                    |
|--------------|--------------|----------------------|
|`int`         |数値入力 / スライダー  |min, max 指定可能         |
|`float`       |数値入力          |precision 指定可能        |
|`string`      |テキスト入力        |max_length, regex 指定可能|
|`bool`        |チェックボックス      |                      |
|`enum`        |ドロップダウン       |enum_ref で定義参照        |
|`int` + `ref` |サジェスト付きドロップダウン|他テーブルの動的な値            |
|`list<int>`   |複数選択          |ref と組み合わせ可能          |
|`list<string>`|タグ入力          |                      |
|`computed`    |自動計算（グレーアウト）  |セル単位でオーバーライド可         |

-----

## 7. バリデーション

### 7.1 validation（エラー — 保存ブロック）

```json
{
  "validation": {
    "required": true,
    "min": 1,
    "max": 99999,
    "max_length": 32,
    "regex": "^[a-zA-Z_]+$",
    "unique": true,
    "ref_exists": true
  }
}
```

GUI表示: 赤枠 + エラーメッセージ

### 7.2 anomaly（警告 — 保存は許可）

```json
{
  "anomaly": {
    "warn_above": 10000,
    "warn_below": 50,
    "warn_deviation": 2.0,
    "warn_delta": 500
  }
}
```

GUI表示: 黄枠 + 警告メッセージ

-----

## 8. 数式エンジン

### 8.1 基本仕様

- computed列に `formula` を定義すると、全レコードにその式が適用される
- セル単位で `override` による式上書き、または `value` による固定値が可能

### 8.2 利用可能な演算・関数（暫定）

```
算術:        +, -, *, /, %, ()
比較:        ==, !=, <, >, <=, >=
論理:        and, or, not
条件:        if(条件, 真, 偽)
集計:        sum(), avg(), min(), max(), count()
参照:        ref(テーブル名, idリスト, カラム名)
文字列:      concat(), length()
```

### 8.3 例

```
# 同テーブルの他カラムを参照
hp * (1 + defense / 100)

# 条件分岐
if(rarity == 'SSR', 0.03, if(rarity == 'SR', 0.10, 0.30))

# 他テーブルの値を集計
sum(ref(skill_master, skill_ids, 'cost'))
```

-----

## 9. GUI仕様

### 9.1 技術スタック

- **React** + **TypeScript**
- **AG Grid** — テーブルUI（セル編集、フィルタ、ソート、範囲選択）

#### ファイルアクセス抽象化

Phase 2でバックエンドをGitHub APIに差し替えられるよう、ファイルアクセスをインターフェースで抽象化する。

```typescript
interface FileBackend {
  listFiles(): Promise<string[]>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  createFile(path: string, content: string): Promise<void>
}

// Phase 1
class LocalFileBackend implements FileBackend {
  // File System Access API を使用
}

// Phase 2
class GitHubFileBackend implements FileBackend {
  // GitHub Contents API / Trees API を使用
  // commit, branch, PR は追加メソッドとして拡張
}
```

### 9.2 画面構成

```
┌─────────────────────────────────────────────────────┐
│ ツールバー                                            │
│  [フォルダ選択] [保存] [エクスポート] [バリデーション実行]  │
├────────────┬────────────────────────────────────────┤
│ テーブル一覧  │  テーブルビュー (AG Grid)                │
│             │ ┌──┬─────┬────┬─────┬──────┐        │
│ ● character │ │ID│ 名前 │ HP │ DEF │ 実効HP│        │
│   skill     │ ├──┼─────┼────┼─────┼──────┤        │
│   quest     │ │1 │アルス │1200│  50 │ 1800 │        │
│   enemy     │ │2 │リナ  │ 800│  30 │ 1040 │        │
│   item      │ │3 │ガルド │1500│  80 │ 9999 │        │
│             │ └──┴─────┴────┴─────┴──────┘        │
│             ├────────────────────────────────────────┤
│             │  セル詳細パネル                          │
│             │  値: 80                                │
│             │  色: yellow (確認中)                     │
│             │  コメント: QAから硬すぎると報告あり #1234   │
│             │  [列の式に戻す] [式を編集] [固定値を入力]   │
└────────────┴────────────────────────────────────────┘
```

### 9.3 セルの視覚表現

|状態                |表示              |
|------------------|----------------|
|通常値               |そのまま表示          |
|computed（列の式）     |薄グレー文字          |
|computed（式オーバーライド）|青文字             |
|computed（固定値）     |太字              |
|validation エラー    |赤枠              |
|anomaly 警告        |黄枠              |
|コメント付き            |右上に三角マーク（Excel風）|
|export: false のカラム|列ヘッダーに目アイコン     |

### 9.4 一括入力・操作

|操作        |動作                                |
|----------|----------------------------------|
|範囲フィル     |選択セルの値を選択範囲全体にコピー（Ctrl+D / Ctrl+R）|
|連番フィル     |右クリック → 連番入力 → 開始値・ステップ指定         |
|パターンフィル   |複数セル選択 → 下にドラッグ → パターン繰り返し        |
|フィルタ中の一括入力|表示中のセルだけに適用                       |
|コピー / ペースト|Excelとの相互コピペ対応                    |

-----

## 10. エクスポート

### 10.1 出力フォーマット

|フォーマット          |用途              |
|----------------|----------------|
|JSON            |Web系ゲーム、汎用      |
|Protocol Buffers|モバイルゲーム、高速パース   |
|CSV             |レガシーシステム連携、デバッグ用|
|MessagePack     |バイナリ軽量配信        |

### 10.2 出力ルール

- `export: false` のカラムは出力から除外
- `computed` 列は計算結果の値を出力（式やメタデータは含めない）
- セルの `color`, `comment` は出力に含めない（作業用メタデータ）
- `base_fields`（id, version）は常に含める
- 出力JSONはスキーマ・メタデータを含まない純粋なレコード配列

### 10.3 出力例（character_master の場合）

```json
[
  { "id": 1, "version": 3, "name": "勇者アルス", "rarity": "SSR", "hp": 1200, "defense": 50, "skill_ids": [1, 3, 7], "effective_hp": 1800 },
  { "id": 2, "version": 5, "name": "魔法使いリナ", "rarity": "SR", "hp": 800, "defense": 30, "skill_ids": [2, 5], "effective_hp": 1040 },
  { "id": 3, "version": 2, "name": "盾の騎士ガルド", "rarity": "SSR", "hp": 1500, "defense": 80, "skill_ids": [1, 4], "effective_hp": 9999 }
]
```

-----

## 11. CI連携

```yaml
# .github/workflows/masterdata.yml
on:
  pull_request:
    paths: ['master/**']

jobs:
  validate:
    steps:
      - run: masterdata-tool validate ./master
        # バリデーションエラーがあればCIが落ちる

  export:
    steps:
      - run: masterdata-tool export ./master -f json -o ./build
      - uses: actions/upload-artifact@v4
        with:
          path: ./build
```

-----

## 12. ロードマップ

### Phase 1: ローカル編集ツール

#### 実装済み ✅

- [x] core: スキーマパーサー
- [x] core: バリデーションエンジン（validation / anomaly）
- [x] core: 数式エンジン
- [x] core: エクスポーター（JSON / CSV）
- [x] gui: AG Gridによるテーブル表示
- [x] gui: セルの色・コメント表示（セル詳細パネル）
- [x] gui: File System Access APIでJSON読み書き
- [x] cli: validate コマンド
- [x] cli: export コマンド（JSON / CSV）
- [x] cli: new コマンド

#### 未実装・課題あり（→ ISSUES.md 参照）

- [ ] gui: セル内直接編集（P0）
- [ ] gui: コピー＆ペースト（P0）
- [ ] gui: 行の追加・削除（P0）
- [ ] gui: キーボードナビゲーション（P1）
- [ ] gui: 型に応じた入力コンポーネント（enum→ドロップダウン、bool→チェックボックス等）（P1）
- [ ] gui: リアルタイムバリデーション（P1）
- [ ] gui: コメントマーカー表示（P1）
- [ ] gui: Undo / Redo（P1）
- [ ] gui: ソート・フィルタ有効化（P2）
- [ ] gui: 一括フィル操作 / 検索・置換（P2）
- [ ] gui: エクスポートボタン（P2）
- [ ] core: list型バリデーション修正（P3）
- [ ] core: 循環参照検出（P3）
- [ ] core: auto:increment 実装（P3）
- [ ] cli: export（protobuf / MessagePack）（P3）

### Phase 2: GitHub連携

- [ ] gui: GitHub OAuth Device Flow 認証
- [ ] gui: GitHub Contents API でファイル読み書き
- [ ] gui: Trees/Blobs API で複数ファイル一括コミット
- [ ] gui: ブランチ作成・切り替えUI
- [ ] gui: PR作成UI
- [ ] gui: Compare APIによる差分表示
- [ ] gui: ファイルアクセスのバックエンド切り替え（ローカル / GitHub）

### 継続検討

- [ ] テーブルデータ肥大化時のファイル分割ルール
- [ ] 数式エンジンの循環参照検出
- [ ] undo/redo の実装方針
- [ ] File System Access API 非対応ブラウザへのフォールバック
- [ ] Protocol Buffers の .proto 自動生成の詳細仕様
- [ ] データマイグレーション（スキーマ変更時の既存データ自動変換）
- [ ] cli: export コマンド（Protocol Buffers / CSV / MessagePack）