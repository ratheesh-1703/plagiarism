CREATE DATABASE IF NOT EXISTS plagiarism_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE plagiarism_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  extracted_text LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_documents_owner (owner_id),
  CONSTRAINT fk_documents_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plagiarism_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  source_text LONGTEXT NOT NULL,
  comparison_text LONGTEXT NOT NULL,
  summary_json JSON NOT NULL,
  sentence_pairs_json JSON NOT NULL,
  direct_copy_pairs_json JSON NULL,
  similarity_matrix_json JSON NOT NULL,
  published_sources_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reports_owner (owner_id),
  CONSTRAINT fk_reports_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
