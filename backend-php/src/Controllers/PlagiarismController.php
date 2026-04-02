<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config;
use App\Database;
use App\PublishedSourceService;
use App\Response;
use App\SimilarityService;
use PDO;
use Throwable;

final class PlagiarismController
{

    public static function uploadText(int $userId, array $payload): void
    {
        $filename = trim((string) ($payload['filename'] ?? 'pasted_text.txt'));
        $text = trim((string) ($payload['text'] ?? ''));

        if ($text === '' || mb_strlen($text) < 20) {
            Response::json(['detail' => 'Text is too short'], 400);
            return;
        }

        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO documents(owner_id, filename, content_type, extracted_text) VALUES(:owner_id, :filename, :content_type, :extracted_text)'
        );
        $stmt->execute([
            'owner_id' => $userId,
            'filename' => $filename,
            'content_type' => 'text/plain',
            'extracted_text' => $text,
        ]);

        $docId = (int) $db->lastInsertId();
        Response::json([
            'document_id' => $docId,
            'filename' => $filename,
            'text_preview' => mb_substr($text, 0, 200),
        ]);
    }

    public static function uploadDocument(int $userId): void
    {
        if (!isset($_FILES['file'])) {
            Response::json(['detail' => 'Missing file'], 400);
            return;
        }

        $file = $_FILES['file'];
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            Response::json(['detail' => 'Invalid upload'], 400);
            return;
        }

        $filename = (string) ($file['name'] ?? 'uploaded.txt');
        $tmpName = (string) ($file['tmp_name'] ?? '');
        $size = (int) ($file['size'] ?? 0);
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

        $maxMb = (int) Config::get('MAX_UPLOAD_MB', '15');
        if ($size > $maxMb * 1024 * 1024) {
            Response::json(['detail' => 'File too large'], 413);
            return;
        }

        $allowed = ['txt', 'docx', 'pdf'];
        if (!in_array($ext, $allowed, true)) {
            Response::json(['detail' => 'Unsupported file type. Allowed: TXT, DOCX, PDF'], 400);
            return;
        }

        $text = self::extractText($tmpName, $ext);
        if (trim($text) === '' || mb_strlen($text) < 20) {
            Response::json(['detail' => 'Could not extract enough text from file'], 400);
            return;
        }

        $uploadDir = Config::get('UPLOAD_DIR', 'storage/uploads');
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }
        $safeName = uniqid('doc_', true) . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
        @move_uploaded_file($tmpName, $uploadDir . DIRECTORY_SEPARATOR . $safeName);

        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO documents(owner_id, filename, content_type, extracted_text) VALUES(:owner_id, :filename, :content_type, :extracted_text)'
        );
        $stmt->execute([
            'owner_id' => $userId,
            'filename' => $filename,
            'content_type' => self::contentTypeFromExt($ext),
            'extracted_text' => $text,
        ]);

        $docId = (int) $db->lastInsertId();
        Response::json([
            'document_id' => $docId,
            'filename' => $filename,
            'text_preview' => mb_substr($text, 0, 200),
        ]);
    }

    public static function checkPlagiarism(int $userId, array $payload): void
    {
        $sourceText = isset($payload['source_text']) ? trim((string) $payload['source_text']) : null;
        $comparisonText = isset($payload['comparison_text']) ? trim((string) $payload['comparison_text']) : null;

        if (!empty($payload['source_document_id'])) {
            $sourceText = self::documentText($userId, (int) $payload['source_document_id']);
        }
        if (!empty($payload['comparison_document_id'])) {
            $comparisonText = self::documentText($userId, (int) $payload['comparison_document_id']);
        }

        if (!$sourceText || !$comparisonText) {
            Response::json(['detail' => 'Provide source/comparison text or valid document IDs'], 400);
            return;
        }

        $analysis = SimilarityService::analyze($sourceText, $comparisonText);
        $published = PublishedSourceService::compareAgainstPublished($sourceText);

        if (!empty($payload['compare_against']) && is_array($payload['compare_against'])) {
            $multiMax = 0.0;
            foreach ($payload['compare_against'] as $candidateText) {
                $candidate = SimilarityService::analyze($sourceText, (string) $candidateText);
                $multiMax = max($multiMax, (float) $candidate['summary']['overall_similarity']);
            }
            $analysis['summary']['multiple_document_max_similarity'] = round($multiMax, 2);
        }
        $analysis['summary']['published_max_similarity'] = (float) ($published['max_published_similarity'] ?? 0.0);
        $analysis['summary']['published_check_status'] = (string) ($published['status'] ?? 'unavailable');
        $analysis['summary']['published_check_message'] = (string) ($published['message'] ?? '');

        $db = Database::connection();
        $insert = $db->prepare(
            'INSERT INTO plagiarism_reports(owner_id, source_text, comparison_text, summary_json, sentence_pairs_json, direct_copy_pairs_json, similarity_matrix_json, published_sources_json)'
            . ' VALUES(:owner_id, :source_text, :comparison_text, :summary_json, :sentence_pairs_json, :direct_copy_pairs_json, :similarity_matrix_json, :published_sources_json)'
        );
        $insert->execute([
            'owner_id' => $userId,
            'source_text' => $sourceText,
            'comparison_text' => $comparisonText,
            'summary_json' => json_encode($analysis['summary']),
            'sentence_pairs_json' => json_encode($analysis['sentence_pairs']),
            'direct_copy_pairs_json' => json_encode($analysis['direct_copy_pairs'] ?? []),
            'similarity_matrix_json' => json_encode($analysis['similarity_matrix']),
            'published_sources_json' => json_encode($published['sources'] ?? []),
        ]);

        $reportId = (int) $db->lastInsertId();
        self::writeReportMarkdown($reportId, $analysis);

        Response::json([
            'report_id' => $reportId,
            'created_at' => date('c'),
            'summary' => $analysis['summary'],
            'sentence_pairs' => $analysis['sentence_pairs'],
            'direct_copy_pairs' => $analysis['direct_copy_pairs'] ?? [],
            'published_source_matches' => $published['sources'] ?? [],
            'similarity_matrix' => $analysis['similarity_matrix'],
            'heatmap' => [
                'z' => $analysis['similarity_matrix'],
                'type' => 'heatmap',
                'colorscale' => 'YlOrRd',
                'hoverongaps' => false,
            ],
        ]);
    }

    public static function getResult(int $userId, int $reportId): void
    {
        $db = Database::connection();
        $stmt = $db->prepare('SELECT * FROM plagiarism_reports WHERE id = :id AND owner_id = :owner_id LIMIT 1');
        $stmt->execute(['id' => $reportId, 'owner_id' => $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::json(['detail' => 'Report not found'], 404);
            return;
        }

        $summary = json_decode((string) $row['summary_json'], true) ?: [];
        $pairs = json_decode((string) $row['sentence_pairs_json'], true) ?: [];
        $directCopyPairs = json_decode((string) ($row['direct_copy_pairs_json'] ?? '[]'), true) ?: [];
        $publishedMatches = json_decode((string) ($row['published_sources_json'] ?? '[]'), true) ?: [];
        $matrix = json_decode((string) $row['similarity_matrix_json'], true) ?: [];

        Response::json([
            'report_id' => (int) $row['id'],
            'created_at' => (string) $row['created_at'],
            'summary' => $summary,
            'sentence_pairs' => $pairs,
            'direct_copy_pairs' => $directCopyPairs,
            'published_source_matches' => $publishedMatches,
            'similarity_matrix' => $matrix,
            'heatmap' => [
                'z' => $matrix,
                'type' => 'heatmap',
                'colorscale' => 'YlOrRd',
                'hoverongaps' => false,
            ],
        ]);
    }


    public static function history(int $userId): void
    {
        $db = Database::connection();
        $stmt = $db->prepare('SELECT id, created_at, summary_json FROM plagiarism_reports WHERE owner_id = :owner_id ORDER BY created_at DESC');
        $stmt->execute(['owner_id' => $userId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $items = [];
        foreach ($rows as $row) {
            $summary = json_decode((string) $row['summary_json'], true) ?: [];
            $items[] = [
                'report_id' => (int) $row['id'],
                'created_at' => (string) $row['created_at'],
                'overall_similarity' => (float) ($summary['overall_similarity'] ?? 0),
                'plagiarism_score' => (float) ($summary['plagiarism_score'] ?? 0),
            ];
        }

        Response::json(['items' => $items]);
    }

    public static function sources(int $userId, string $platformFilter = ''): void
    {
        $db = Database::connection();
        try {
            $stmt = $db->prepare('SELECT id, created_at, published_sources_json FROM plagiarism_reports WHERE owner_id = :owner_id ORDER BY created_at DESC');
            $stmt->execute(['owner_id' => $userId]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (Throwable) {
            // Legacy schema without published_sources_json column.
            Response::json(['items' => []]);
            return;
        }

        $items = [];
        foreach ($rows as $row) {
            $sources = json_decode((string) ($row['published_sources_json'] ?? '[]'), true);
            if (!is_array($sources)) {
                continue;
            }
            foreach ($sources as $source) {
                $platform = (string) ($source['platform'] ?? 'Unknown');
                if ($platformFilter !== '' && mb_strtolower($platform, 'UTF-8') !== mb_strtolower($platformFilter, 'UTF-8')) {
                    continue;
                }
                $items[] = [
                    'report_id' => (int) $row['id'],
                    'created_at' => (string) $row['created_at'],
                    'platform' => $platform,
                    'title' => (string) ($source['title'] ?? ''),
                    'url' => (string) ($source['url'] ?? ''),
                    'matched_percentage' => (float) ($source['matched_percentage'] ?? 0),
                ];
            }
        }

        usort($items, static fn ($a, $b) => $b['matched_percentage'] <=> $a['matched_percentage']);
        Response::json(['items' => $items]);
    }

    public static function downloadReport(int $userId, int $reportId): void
    {
        $db = Database::connection();
        $stmt = $db->prepare('SELECT id, owner_id, summary_json, sentence_pairs_json, created_at FROM plagiarism_reports WHERE id = :id AND owner_id = :owner_id LIMIT 1');
        $stmt->execute(['id' => $reportId, 'owner_id' => $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            Response::json(['detail' => 'Report not found'], 404);
            return;
        }

        $summary = json_decode((string) $row['summary_json'], true) ?: [];
        $pairs = json_decode((string) $row['sentence_pairs_json'], true) ?: [];

        $lines = [
            '# Plagiarism Report ' . $reportId,
            'Generated: ' . (string) $row['created_at'],
            '',
            '- Overall similarity: ' . ($summary['overall_similarity'] ?? 0) . '%',
            '- Plagiarism score: ' . ($summary['plagiarism_score'] ?? 0) . '%',
            '- Direct copy percentage: ' . ($summary['direct_copy_percentage'] ?? 0) . '%',
            '- TF-IDF baseline: ' . ($summary['tfidf_similarity'] ?? 0) . '%',
            '- AI involvement percentage: ' . ($summary['ai_involvement_percentage'] ?? 0) . '%',
            '- Humanized by AI: ' . (!empty($summary['humanized_by_ai_detected']) ? 'yes' : 'no'),
            '- Published source max similarity: ' . ($summary['published_max_similarity'] ?? 0) . '%',
            '',
            '## Sentence Pairs',
        ];

        foreach ($pairs as $p) {
            $lines[] = '- Score: ' . ($p['score'] ?? 0) . ' | Flagged: ' . (!empty($p['flagged']) ? 'yes' : 'no');
            $lines[] = '  - Source: ' . ($p['source_sentence'] ?? '');
            $lines[] = '  - Target: ' . ($p['target_sentence'] ?? '');
        }

        Response::markdown(implode("\n", $lines), 'report_' . $reportId . '.md');
    }

    private static function documentText(int $userId, int $docId): ?string
    {
        $db = Database::connection();
        $stmt = $db->prepare('SELECT extracted_text FROM documents WHERE id = :id AND owner_id = :owner_id LIMIT 1');
        $stmt->execute(['id' => $docId, 'owner_id' => $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? (string) $row['extracted_text'] : null;
    }

    private static function writeReportMarkdown(int $reportId, array $analysis): void
    {
        $reportDir = Config::get('REPORT_DIR', 'storage/reports');
        if (!is_dir($reportDir)) {
            mkdir($reportDir, 0777, true);
        }

        $summary = $analysis['summary'];
        $lines = [
            '# Plagiarism Report ' . $reportId,
            'Generated: ' . date('c'),
            '',
            '- Overall similarity: ' . $summary['overall_similarity'] . '%',
            '- Plagiarism score: ' . $summary['plagiarism_score'] . '%',
            '- Direct copy percentage: ' . ($summary['direct_copy_percentage'] ?? 0) . '%',
            '- TF-IDF baseline: ' . $summary['tfidf_similarity'] . '%',
            '- AI involvement percentage: ' . ($summary['ai_involvement_percentage'] ?? 0) . '%',
            '- Humanized by AI: ' . (!empty($summary['humanized_by_ai_detected']) ? 'yes' : 'no'),
            '- Published source max similarity: ' . ($summary['published_max_similarity'] ?? 0) . '%',
        ];

        file_put_contents($reportDir . DIRECTORY_SEPARATOR . 'report_' . $reportId . '.md', implode("\n", $lines));
    }

    private static function extractText(string $tmpName, string $ext): string
    {
        if ($ext === 'txt') {
            return (string) file_get_contents($tmpName);
        }

        if ($ext === 'docx') {
            return self::extractDocxText($tmpName);
        }

        if ($ext === 'pdf') {
            // Lightweight fallback extraction for PDF binary text blocks.
            $raw = (string) file_get_contents($tmpName);
            $text = preg_replace('/[^\x20-\x7E\n\r\t]/', ' ', $raw) ?? '';
            return trim(preg_replace('/\s+/', ' ', $text) ?? '');
        }

        return '';
    }

    private static function extractDocxText(string $path): string
    {
        try {
            $zip = new \ZipArchive();
            if ($zip->open($path) !== true) {
                return '';
            }
            $xml = (string) $zip->getFromName('word/document.xml');
            $zip->close();
            if ($xml === '') {
                return '';
            }
            $xml = str_replace(['</w:p>', '</w:tr>'], ["\n", "\n"], $xml);
            $text = strip_tags($xml);
            return trim(preg_replace('/\s+/', ' ', $text) ?? '');
        } catch (Throwable) {
            return '';
        }
    }

    private static function contentTypeFromExt(string $ext): string
    {
        return match ($ext) {
            'txt' => 'text/plain',
            'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'pdf' => 'application/pdf',
            default => 'application/octet-stream',
        };
    }
}
