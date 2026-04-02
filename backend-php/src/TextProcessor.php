<?php

declare(strict_types=1);

namespace App;

final class TextProcessor
{
    public static function sentenceSplit(string $text): array
    {
        $parts = preg_split('/(?<=[.!?])\s+/', trim($text)) ?: [];
        return array_values(array_filter(array_map('trim', $parts), static fn ($s) => $s !== ''));
    }

    public static function tokenize(string $text): array
    {
        $clean = mb_strtolower($text, 'UTF-8');
        $clean = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $clean) ?? '';
        $tokens = preg_split('/\s+/', trim($clean)) ?: [];

        $stop = [
            'a', 'an', 'and', 'the', 'is', 'are', 'was', 'were', 'to', 'for', 'of',
            'in', 'on', 'at', 'by', 'from', 'with', 'as', 'that', 'this', 'it', 'be',
        ];

        return array_values(array_filter($tokens, static fn ($t) => $t !== '' && !in_array($t, $stop, true)));
    }

    public static function cosine(string $a, string $b): float
    {
        $aTokens = self::tokenize($a);
        $bTokens = self::tokenize($b);
        if ($aTokens === [] || $bTokens === []) {
            return 0.0;
        }

        $aFreq = array_count_values($aTokens);
        $bFreq = array_count_values($bTokens);
        $terms = array_unique(array_merge(array_keys($aFreq), array_keys($bFreq)));

        $dot = 0.0;
        $aNorm = 0.0;
        $bNorm = 0.0;

        foreach ($terms as $t) {
            $av = (float) ($aFreq[$t] ?? 0);
            $bv = (float) ($bFreq[$t] ?? 0);
            $dot += $av * $bv;
            $aNorm += $av * $av;
            $bNorm += $bv * $bv;
        }

        if ($aNorm <= 0 || $bNorm <= 0) {
            return 0.0;
        }

        return $dot / (sqrt($aNorm) * sqrt($bNorm));
    }

    public static function ngrams(string $text, int $n = 3): array
    {
        $tokens = self::tokenize($text);
        if (count($tokens) < $n) {
            return [];
        }
        $grams = [];
        for ($i = 0; $i <= count($tokens) - $n; $i++) {
            $grams[] = implode(' ', array_slice($tokens, $i, $n));
        }
        return $grams;
    }

    public static function ngramJaccard(string $a, string $b, int $n = 3): float
    {
        $aSet = array_unique(self::ngrams($a, $n));
        $bSet = array_unique(self::ngrams($b, $n));
        if ($aSet === [] || $bSet === []) {
            return 0.0;
        }
        $inter = count(array_intersect($aSet, $bSet));
        $union = count(array_unique(array_merge($aSet, $bSet)));
        if ($union === 0) {
            return 0.0;
        }
        return $inter / $union;
    }

    public static function tokenEntropy(string $text): float
    {
        $tokens = self::tokenize($text);
        if ($tokens === []) {
            return 0.0;
        }
        $freq = array_count_values($tokens);
        $total = count($tokens);
        $entropy = 0.0;
        foreach ($freq as $count) {
            $p = $count / $total;
            if ($p > 0) {
                $entropy -= $p * log($p, 2);
            }
        }
        return $entropy;
    }

    public static function perplexityProxy(string $text): float
    {
        // Proxy metric: converts token entropy into a pseudo-perplexity scale.
        return pow(2, self::tokenEntropy($text));
    }

    public static function sentenceBurstiness(string $text): float
    {
        $sentences = self::sentenceSplit($text);
        if ($sentences === []) {
            return 0.0;
        }
        $lengths = array_map(static fn ($s) => count(self::tokenize((string) $s)), $sentences);
        $mean = array_sum($lengths) / count($lengths);
        if ($mean <= 0.0) {
            return 0.0;
        }
        $variance = 0.0;
        foreach ($lengths as $len) {
            $variance += ($len - $mean) ** 2;
        }
        $variance /= count($lengths);
        return sqrt($variance) / $mean;
    }
}
