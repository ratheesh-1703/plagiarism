ALTER TABLE plagiarism_reports
  ADD COLUMN IF NOT EXISTS direct_copy_pairs_json JSON NULL,
  ADD COLUMN IF NOT EXISTS published_sources_json JSON NULL;
