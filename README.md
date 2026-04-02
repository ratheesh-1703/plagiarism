# Plagiarism Detection with Semantic Similarity

Production-style full-stack system for semantic plagiarism and AI-content detection using PHP, MySQL, and Next.js.

## Tech Stack

- Frontend: Next.js 14, React, TailwindCSS, Plotly
- Backend: PHP 8.3+, PDO/MySQL, JWT, bcrypt
- NLP Engine: Hybrid NLP (tokenization, n-gram matching, semantic/stylometric scoring)
- Database: MySQL
- Deployment: Docker and Docker Compose

## Features

- User registration and secure login
- JWT authentication and password hashing
- Upload documents (`PDF`, `DOCX`, `TXT`) or paste text
- Sentence-level semantic similarity and plagiarism scoring
- Paraphrase-aware detection with SBERT embeddings
- Similarity heatmap and sentence comparison table
- Report history and downloadable markdown report
- TF-IDF vs SBERT comparison in every report summary
- Basic per-route rate limiting and file validation

## Quick Start (Docker)

1. Copy environment files:
   - `copy backend-php\\.env.example backend-php\\.env`
   - `copy frontend\\.env.local.example frontend\\.env.local`
2. Run containers:
   - `docker compose -f docker-compose.prod.yml up --build`
3. Open:
   - Frontend: `http://localhost:3000`
   - Backend health: `http://localhost:8000/api/health`

## Quick Start (Local)

### Backend (PHP)

1. `cd backend-php`
2. Configure `.env` from `.env.example`
3. Run database migrations: `php scripts/migrate.php`
4. Run API: `php -S 0.0.0.0:8000 -t public`

### Frontend

1. `cd frontend`
2. `npm install`
3. Configure `.env.local` from `.env.local.example`
4. `npm run dev`

## Required API Endpoints

- `POST /api/register`
- `POST /api/login`
- `POST /api/upload-document`
- `POST /api/check-plagiarism`
- `GET /api/results/{id}`
- `GET /api/history`

## NLP Pipeline

1. Document upload or pasted text
2. Text extraction
3. Preprocessing (lowercasing, token filtering)
4. Sentence segmentation
5. SBERT embedding generation
6. Cosine similarity matrix
7. High-similarity pair detection
8. Plagiarism score computation
9. Report + heatmap generation

## Docs

- `docs/architecture.md`
- `docs/flowchart.md`
- `docs/api-documentation.md`
- `docs/ml-explanation.md`
- `docs/ui-mockups.md`
- `docs/deployment-guide.md`
- `docs/demo-output.md`
