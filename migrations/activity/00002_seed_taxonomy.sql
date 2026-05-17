-- migrations/activity/00002_seed_taxonomy.sql
-- Seed the canonical taxonomy: 5 categories + 13 subcategories.
-- ON CONFLICT DO NOTHING makes this idempotent on re-run.

INSERT INTO activity_categories (id, name, sort_order) VALUES
  (1, 'Work',          1),
  (2, 'Home',          2),
  (3, 'Personal',      3),
  (4, 'General query', 4),
  (5, 'Product search',5)
ON CONFLICT(name) DO NOTHING;

-- Subcategories: default category_id = Work (1) for professional/IT ones;
-- Home maintenance -> Home (2); Family -> Personal (3).
INSERT INTO activity_subcategories (category_id, name, sort_order) VALUES
  (1, 'Governance',          1),
  (1, 'Complaints',          2),
  (1, 'Service planning',    3),
  (1, 'Medico-legal',        4),
  (1, 'VPS infrastructure',  5),
  (1, 'M365 automation',     6),
  (1, 'App development',     7),
  (3, 'Family',              1),
  (5, 'Shopping',            1),
  (2, 'Home maintenance',    1),
  (1, 'Photography studio',  8),
  (3, 'Gaming Axel',         2),
  (1, 'Other',               99)
ON CONFLICT(category_id, name) DO NOTHING;
