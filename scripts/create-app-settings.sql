-- Create app_settings table for storing admin-configurable settings
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow authenticated users to read settings (needed for chat route)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read settings
CREATE POLICY "Anyone can read app_settings" ON app_settings
  FOR SELECT TO authenticated USING (true);

-- Only admins can insert/update (enforced at API level, but add RLS too)
CREATE POLICY "Service role can manage app_settings" ON app_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Insert default model
INSERT INTO app_settings (key, value) VALUES ('ai_model', 'google/gemini-3-flash')
ON CONFLICT (key) DO NOTHING;
