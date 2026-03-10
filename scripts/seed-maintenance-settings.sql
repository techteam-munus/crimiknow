-- Seed maintenance mode settings into app_settings table
INSERT INTO app_settings (key, value) VALUES 
  ('maintenance_enabled', 'false'),
  ('maintenance_message', 'CrimiKnow is currently undergoing scheduled maintenance. We will be back shortly.'),
  ('maintenance_start', ''),
  ('maintenance_end', '')
ON CONFLICT (key) DO NOTHING;
