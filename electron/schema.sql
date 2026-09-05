PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Un mazo por modo (hiragana, katakana, vocabulario) o por nivel de kanji.
CREATE TABLE IF NOT EXISTS deck (
  id       INTEGER PRIMARY KEY,
  kind     TEXT    NOT NULL,           -- hiragana | katakana | vocab | kanji
  slug     TEXT    NOT NULL UNIQUE,
  name     TEXT    NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

-- La unidad de conocimiento: un kana, una palabra o (en fase 2) un kanji.
CREATE TABLE IF NOT EXISTS item (
  id         INTEGER PRIMARY KEY,
  deck_id    INTEGER NOT NULL REFERENCES deck(id) ON DELETE CASCADE,
  glyph      TEXT    NOT NULL,         -- か / コーヒー / 漢
  reading    TEXT    NOT NULL,         -- ka / koohii / かん
  alt        TEXT    NOT NULL DEFAULT '[]',  -- JSON: respuestas alternativas
  meaning    TEXT,                     -- solo vocabulario y kanji
  block      TEXT    NOT NULL,         -- gojuon | dakuten | yoon | extended | ...
  row_key    TEXT    NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (deck_id, glyph)
);

-- Un ítem genera N cartas. En kana: recognition + recall.
-- En kanji (fase 2): recognition + reading + word, con el mismo mecanismo.
CREATE TABLE IF NOT EXISTS card (
  id             INTEGER PRIMARY KEY,
  item_id        INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  card_type      TEXT    NOT NULL,     -- recognition | recall | reading | word
  -- Estado FSRS (espejo exacto del tipo Card de ts-fsrs 5.x)
  due            TEXT    NOT NULL,
  stability      REAL    NOT NULL DEFAULT 0,
  difficulty     REAL    NOT NULL DEFAULT 0,
  elapsed_days   INTEGER NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  reps           INTEGER NOT NULL DEFAULT 0,
  lapses         INTEGER NOT NULL DEFAULT 0,
  state          INTEGER NOT NULL DEFAULT 0,  -- 0 New 1 Learning 2 Review 3 Relearning
  last_review    TEXT,
  -- Gestión propia
  locked         INTEGER NOT NULL DEFAULT 0,  -- aún no desbloqueada por progresión
  suspended      INTEGER NOT NULL DEFAULT 0,  -- leech: apartada manual o automáticamente
  -- Lapsus a partir de los cuales se aparta. Sube al reactivarla, para dar
  -- un ciclo limpio sin falsear el historial que FSRS usa para calcular.
  leech_at       INTEGER NOT NULL DEFAULT 8,
  UNIQUE (item_id, card_type)
);

CREATE INDEX IF NOT EXISTS idx_card_due ON card (due) WHERE locked = 0 AND suspended = 0;
CREATE INDEX IF NOT EXISTS idx_card_item ON card (item_id);

CREATE TABLE IF NOT EXISTS review (
  id           INTEGER PRIMARY KEY,
  card_id      INTEGER NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  reviewed_at  TEXT    NOT NULL,
  rating       INTEGER NOT NULL,       -- 1 Again 2 Hard 3 Good 4 Easy
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  state_before INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_review_at ON review (reviewed_at);

CREATE TABLE IF NOT EXISTS setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
