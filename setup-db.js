/**
 * setup-db.js
 * Run once to create all Supabase tables.
 * Usage:
 *   npm install pg
 *   node setup-db.js
 */
const { Client } = require('pg');

const client = new Client({
  host:     'db.flqotwokqcpjwrgxsjrq.supabase.co',
  port:     5432,
  database: 'postgres',
  user:     'postgres',
  password: 'HarAm@8309211016',
  ssl:      { rejectUnauthorized: false },
});

const SQL = `

/* ── shared trigger function ───────────────────────────────── */
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

/* ══════════════════════════════════════════════════════════════
   TABLE 1 · notes
══════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS notes (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title         TEXT        NOT NULL DEFAULT 'Untitled',
  category      TEXT        NOT NULL DEFAULT 'Personal',
  content       TEXT        DEFAULT '',
  content_text  TEXT        DEFAULT '',
  color         TEXT        DEFAULT 'default',
  pinned        BOOLEAN     DEFAULT false,
  favorite      BOOLEAN     DEFAULT false,
  date          TEXT,
  last_modified TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes: owner full access" ON notes;
CREATE POLICY "notes: owner full access"
  ON notes FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notes_user_created  ON notes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_category      ON notes (user_id, category);
CREATE INDEX IF NOT EXISTS idx_notes_pinned        ON notes (user_id, pinned)   WHERE pinned   = true;
CREATE INDEX IF NOT EXISTS idx_notes_favorite      ON notes (user_id, favorite) WHERE favorite = true;
CREATE INDEX IF NOT EXISTS idx_notes_fts ON notes
  USING GIN (to_tsvector('english',
    coalesce(title,'') || ' ' || coalesce(content_text,'')
  ));

CREATE OR REPLACE FUNCTION notes_set_last_modified()
RETURNS TRIGGER AS $$
BEGIN NEW.last_modified = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notes_last_modified ON notes;
CREATE TRIGGER trg_notes_last_modified
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION notes_set_last_modified();

/* ══════════════════════════════════════════════════════════════
   TABLE 2 · user_profiles
══════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS user_profiles (
  id           UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT DEFAULT '',
  avatar_url   TEXT DEFAULT '',
  bio          TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: owner full access" ON user_profiles;
CREATE POLICY "profiles: owner full access"
  ON user_profiles FOR ALL
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP TRIGGER IF EXISTS trg_user_profiles_updated ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name',''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url','')
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_new_user_profile ON auth.users;
CREATE TRIGGER trg_new_user_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_profile();

/* ══════════════════════════════════════════════════════════════
   TABLE 3 · user_settings
══════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS user_settings (
  id                       UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  theme                    TEXT DEFAULT 'light',
  gemini_api_key           TEXT DEFAULT '',
  cloudinary_cloud_name    TEXT DEFAULT '',
  cloudinary_upload_preset TEXT DEFAULT '',
  updated_at               TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings: owner full access" ON user_settings;
CREATE POLICY "settings: owner full access"
  ON user_settings FOR ALL
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP TRIGGER IF EXISTS trg_user_settings_updated ON user_settings;
CREATE TRIGGER trg_user_settings_updated
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION handle_new_user_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_settings (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_new_user_settings ON auth.users;
CREATE TRIGGER trg_new_user_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_settings();

/* ══════════════════════════════════════════════════════════════
   TABLE 4 · note_drafts
══════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS note_drafts (
  id       UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  title    TEXT DEFAULT '',
  content  TEXT DEFAULT '',
  category TEXT DEFAULT 'Personal',
  color    TEXT DEFAULT 'default',
  saved_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE note_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drafts: owner full access" ON note_drafts;
CREATE POLICY "drafts: owner full access"
  ON note_drafts FOR ALL
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

/* ══════════════════════════════════════════════════════════════
   TABLE 5 · categories
══════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS categories (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL,
  icon       TEXT DEFAULT 'fa-folder',
  color      TEXT DEFAULT '#64748b',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories: owner full access" ON categories;
CREATE POLICY "categories: owner full access"
  ON categories FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_categories_user ON categories (user_id);

/* ══════════════════════════════════════════════════════════════
   TABLE 6 · ai_usage_log
══════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  note_id    UUID REFERENCES notes(id)      ON DELETE SET NULL,
  action     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_log: owner full access" ON ai_usage_log;
CREATE POLICY "ai_log: owner full access"
  ON ai_usage_log FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_log_user ON ai_usage_log (user_id, created_at DESC);

/* ══════════════════════════════════════════════════════════════
   TABLE 7 · tags  +  note_tags  (many-to-many)
══════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS tags (
  id      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name    TEXT NOT NULL,
  UNIQUE (user_id, name)
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tags: owner full access" ON tags;
CREATE POLICY "tags: owner full access"
  ON tags FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tags_user ON tags (user_id);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE NOT NULL,
  tag_id  UUID REFERENCES tags(id)  ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (note_id, tag_id)
);

ALTER TABLE note_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "note_tags: owner full access" ON note_tags;
CREATE POLICY "note_tags: owner full access"
  ON note_tags FOR ALL
  USING (
    EXISTS (SELECT 1 FROM notes n WHERE n.id = note_id AND n.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags (note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag  ON note_tags (tag_id);

`;

async function main() {
  try {
    console.log('Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('Connected!\n');

    const steps = [
      'set_updated_at function',
      'notes table',
      'user_profiles table',
      'user_settings table',
      'note_drafts table',
      'categories table',
      'ai_usage_log table',
      'tags + note_tags tables',
    ];

    console.log('Creating tables...');
    await client.query(SQL);

    steps.forEach(s => console.log(`  ✔  ${s}`));
    console.log('\n✅ All 7 tables created successfully in Supabase!\n');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
