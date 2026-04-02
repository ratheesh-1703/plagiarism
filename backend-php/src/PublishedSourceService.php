<?php

declare(strict_types=1);

namespace App;

final class PublishedSourceService
{
    public static function compareAgainstPublished(string $sourceText): array
    {
        $query = self::buildQuery($sourceText);
        if ($query === '') {
            return [
                'status' => 'skipped',
                'message' => 'Not enough text to query published sources',
                'sources' => [],
                'max_published_similarity' => 0.0,
            ];
        }

        $candidates = array_merge(
            self::fetchOpenAlex($query),
            self::fetchCrossref($query),
            self::fetchIeee($query),
            self::fetchScopus($query),
        );

        if ($candidates === []) {
            return [
                'status' => 'unavailable',
                'message' => 'No published-source APIs responded (or API keys missing for IEEE/Scopus).',
                'sources' => [],
                'max_published_similarity' => 0.0,
            ];
        }

        $sourceSentences = TextProcessor::sentenceSplit($sourceText);
        $ranked = [];
        $maxSimilarity = 0.0;

        foreach ($candidates as $candidate) {
            $candidateText = trim(($candidate['title'] ?? '') . ' ' . ($candidate['abstract'] ?? ''));
            if ($candidateText === '') {
                continue;
            }

            $sentenceMatches = [];
            $best = 0.0;
            foreach ($sourceSentences as $sentence) {
                $score = TextProcessor::cosine($sentence, $candidateText);
                if ($score > $best) {
                    $best = $score;
                }
                if ($score >= 0.55) {
                    $sentenceMatches[] = [
                        'sentence' => $sentence,
                        'score' => round($score * 100, 2),
                    ];
                }
            }

            usort($sentenceMatches, static fn ($a, $b) => $b['score'] <=> $a['score']);
            $sentenceMatches = array_slice($sentenceMatches, 0, 3);

            $maxSimilarity = max($maxSimilarity, $best * 100);
            $ranked[] = [
                'platform' => $candidate['platform'] ?? 'Published Source',
                'title' => $candidate['title'] ?? 'Untitled',
                'url' => $candidate['url'] ?? '',
                'matched_percentage' => round($best * 100, 2),
                'matched_sentences' => $sentenceMatches,
            ];
        }

        usort($ranked, static fn ($a, $b) => $b['matched_percentage'] <=> $a['matched_percentage']);
        $ranked = array_slice($ranked, 0, 6);

        return [
            'status' => 'ok',
            'message' => 'Published paper comparison completed',
            'sources' => $ranked,
            'max_published_similarity' => round($maxSimilarity, 2),
        ];
    }

    private static function buildQuery(string $sourceText): string
    {
        $sentences = TextProcessor::sentenceSplit($sourceText);
        $first = $sentences[0] ?? $sourceText;
        $tokens = array_slice(TextProcessor::tokenize($first), 0, 12);
        return trim(implode(' ', $tokens));
    }

    private static function fetchOpenAlex(string $query): array
    {
        $url = 'https://api.openalex.org/works?search=' . rawurlencode($query) . '&per-page=4';
        $json = self::httpJson($url);
        if (!isset($json['results']) || !is_array($json['results'])) {
            return [];
        }

        $out = [];
        foreach ($json['results'] as $item) {
            $title = (string) ($item['display_name'] ?? '');
            $sourceName = (string) (($item['primary_location']['source']['display_name'] ?? '') ?: 'OpenAlex');
            $abstract = self::openAlexAbstractToText($item['abstract_inverted_index'] ?? null);
            $doi = (string) ($item['ids']['doi'] ?? '');

            $platform = self::platformFromSourceName($sourceName, 'OpenAlex');
            $url = $doi !== '' ? $doi : (string) ($item['id'] ?? '');
            $out[] = [
                'platform' => $platform,
                'title' => $title,
                'abstract' => $abstract,
                'url' => $url,
            ];
        }

        return $out;
    }

    private static function fetchCrossref(string $query): array
    {
        $url = 'https://api.crossref.org/works?rows=4&query.bibliographic=' . rawurlencode($query);
        $json = self::httpJson($url);
        $items = $json['message']['items'] ?? null;
        if (!is_array($items)) {
            return [];
        }

        $out = [];
        foreach ($items as $item) {
            $title = '';
            if (isset($item['title'][0])) {
                $title = (string) $item['title'][0];
            }
            $publisher = (string) ($item['publisher'] ?? 'Crossref');
            $abstract = strip_tags((string) ($item['abstract'] ?? ''));
            $doi = (string) ($item['DOI'] ?? '');
            $doiUrl = $doi !== '' ? 'https://doi.org/' . $doi : '';

            $out[] = [
                'platform' => self::platformFromSourceName($publisher, 'Crossref'),
                'title' => $title,
                'abstract' => $abstract,
                'url' => $doiUrl,
            ];
        }

        return $out;
    }

    private static function fetchIeee(string $query): array
    {
        $apiKey = Config::get('IEEE_API_KEY', '');
        if ($apiKey === '') {
            return [];
        }
        $url = 'https://ieeexploreapi.ieee.org/api/v1/search/articles?apikey=' . rawurlencode($apiKey)
            . '&format=json&max_records=3&start_record=1&sort_order=desc&sort_field=article_number&querytext=' . rawurlencode($query);
        $json = self::httpJson($url);
        if (!isset($json['articles']) || !is_array($json['articles'])) {
            return [];
        }

        $out = [];
        foreach ($json['articles'] as $article) {
            $title = (string) ($article['title'] ?? '');
            $abstract = (string) ($article['abstract'] ?? '');
            $url = (string) ($article['html_url'] ?? '');
            $out[] = [
                'platform' => 'IEEE',
                'title' => $title,
                'abstract' => $abstract,
                'url' => $url,
            ];
        }
        return $out;
    }

    private static function fetchScopus(string $query): array
    {
        $apiKey = Config::get('SCOPUS_API_KEY', '');
        if ($apiKey === '') {
            return [];
        }

        $url = 'https://api.elsevier.com/content/search/scopus?count=3&query=' . rawurlencode($query);
        $json = self::httpJson($url, ['X-ELS-APIKey: ' . $apiKey]);
        $entries = $json['search-results']['entry'] ?? null;
        if (!is_array($entries)) {
            return [];
        }

        $out = [];
        foreach ($entries as $entry) {
            $title = (string) ($entry['dc:title'] ?? '');
            $source = (string) ($entry['prism:publicationName'] ?? 'Scopus');
            $url = (string) ($entry['prism:url'] ?? '');
            $out[] = [
                'platform' => self::platformFromSourceName($source, 'Scopus'),
                'title' => $title,
                'abstract' => $title,
                'url' => $url,
            ];
        }
        return $out;
    }

    private static function httpJson(string $url, array $headers = []): array
    {
        if (!function_exists('curl_init')) {
            $ctx = stream_context_create([
                'http' => [
                    'method' => 'GET',
                    'timeout' => 8,
                    'header' => implode("\r\n", array_merge(['Accept: application/json'], $headers)),
                ],
            ]);
            $raw = @file_get_contents($url, false, $ctx);
            if (!is_string($raw) || $raw === '') {
                return [];
            }
            $decoded = json_decode($raw, true);
            return is_array($decoded) ? $decoded : [];
        }

        $ch = curl_init($url);
        if ($ch === false) {
            return [];
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
        ]);

        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if (!is_string($raw) || $raw === '' || $code < 200 || $code >= 300) {
            return [];
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    private static function openAlexAbstractToText(mixed $invertedIndex): string
    {
        if (!is_array($invertedIndex)) {
            return '';
        }
        $wordPositions = [];
        foreach ($invertedIndex as $word => $positions) {
            if (!is_array($positions)) {
                continue;
            }
            foreach ($positions as $pos) {
                $wordPositions[(int) $pos] = (string) $word;
            }
        }
        if ($wordPositions === []) {
            return '';
        }
        ksort($wordPositions);
        return implode(' ', $wordPositions);
    }

    private static function platformFromSourceName(string $sourceName, string $fallback): string
    {
        $name = mb_strtolower($sourceName, 'UTF-8');
        if (str_contains($name, 'ieee')) {
            return 'IEEE';
        }
        if (str_contains($name, 'scopus')) {
            return 'Scopus';
        }
        if (str_contains($name, 'elsevier')) {
            return 'Scopus/Elsevier';
        }
        return $fallback;
    }
}
