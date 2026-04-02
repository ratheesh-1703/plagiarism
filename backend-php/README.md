# PHP Backend (XAMPP)

This backend is designed for XAMPP (Apache + MySQL) and exposes:

- `POST /api/register`
- `POST /api/login`
- `POST /api/upload-document`
- `POST /api/upload-text`
- `POST /api/check-plagiarism`
- `GET /api/results/{id}`
- `GET /api/results/{id}/download`
- `GET /api/history`
- `GET /api/sources`
- `GET /api/health`

## 1) Create Database in XAMPP

1. Start `Apache` and `MySQL` in XAMPP Control Panel.
2. Open `http://localhost/phpmyadmin`.
3. Click `Import`.
4. Select file: `backend-php/database.sql`.
5. Run import. This creates `plagiarism_db` and tables.

Alternative (migration-first):

```bash
php scripts/migrate.php
```

## 2) Configure Environment

1. Copy `.env.example` to `.env` inside `backend-php`.
2. Adjust DB credentials if needed:
   - `DB_HOST=127.0.0.1`
   - `DB_PORT=3306`
   - `DB_NAME=plagiarism_db`
   - `DB_USER=root`
   - `DB_PASS=`

## 3) Place Project Under XAMPP htdocs

Your backend URL in frontend is:

`http://localhost/plagiarism/backend-php/public/api`

So project path should be:

`C:\xampp\htdocs\plagiarism\backend-php\public`

If your project is elsewhere, either:
- move it under `htdocs/plagiarism`, or
- update `NEXT_PUBLIC_API_URL` in frontend.

## 4) Run Frontend

In `frontend/.env.local` set:

`NEXT_PUBLIC_API_URL=http://localhost/plagiarism/backend-php/public/api`

Then run frontend:

```bash
npm run dev
```

## Notes

- Passwords are hashed with `password_hash`.
- Auth uses signed JWT bearer tokens with issuer/audience/iat/nbf/exp checks.
- Upload supports TXT, DOCX, PDF (PDF extraction is best-effort text fallback).
- Reports are persisted in MySQL and can be downloaded as markdown.
- Rate limiting and structured logs are enabled (`storage/cache/ratelimits`, `storage/logs/app.log`).

## Production Containers

Run production stack with Nginx + PHP-FPM + MySQL:

```bash
docker compose -f ../docker-compose.prod.yml up --build
```

Then open:

- API: `http://localhost:8000/api/health`
