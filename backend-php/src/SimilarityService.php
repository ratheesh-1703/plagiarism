<?php

declare(strict_types=1);

namespace App;

final class SimilarityService
{
    public static function analyze(string $sourceText, string $targetText): array
    {
        $threshold = (float) Config::get('PLAGIARISM_THRESHOLD', '0.72');
        $sourceSentences = TextProcessor::sentenceSplit($sourceText);
        $targetSentences = TextProcessor::sentenceSplit($targetText);

        if ($sourceSentences === [] || $targetSentences === []) {
            return [
                'summary' => [
                    'overall_similarity' => 0.0,
                    'plagiarism_score' => 0.0,
                    'direct_copy_percentage' => 0.0,
                    'flagged_pairs' => 0,
                    'total_pairs' => 0,
                    'tfidf_similarity' => 0.0,
                    'threshold' => $threshold,
                    'ai_rewrite_likelihood' => 0.0,
                    'ai_involvement_percentage' => 0.0,
                    'human_written_percentage' => 100.0,
                    'perplexity_proxy' => 0.0,
                    'token_entropy' => 0.0,
                    'sentence_burstiness' => 0.0,
                    'type_token_ratio' => 0.0,
                    'humanized_by_ai_detected' => false,
                    'humanized_reason' => 'Insufficient text for AI-humanized analysis.',
                    'multiple_document_max_similarity' => 0.0,
                ],
                'sentence_pairs' => [],
                'direct_copy_pairs' => [],
                'similarity_matrix' => [],
            ];
        }

        $matrix = [];
        $pairs = [];
        $directCopyPairs = [];
        $flagged = 0;
        $scores = [];
        $directCopyCount = 0;
        $copyPasteThreshold = 0.88;

        foreach ($sourceSentences as $sIndex => $source) {
            $row = [];
            $best = 0.0;
            $bestTarget = '';
            foreach ($targetSentences as $target) {
                $semanticScore = TextProcessor::cosine($source, $target);
                $ngramScore = TextProcessor::ngramJaccard($source, $target, 3);
                $score = (0.72 * $semanticScore) + (0.28 * $ngramScore);
                $row[] = round($score, 4);
                if ($score > $best) {
                    $best = $score;
                    $bestTarget = $target;
                }
            }
            $matrix[] = $row;
            $isFlagged = $best >= $threshold;
            if ($isFlagged) {
                $flagged++;
            }
            $pairs[] = [
                'source_sentence' => $source,
                'target_sentence' => $bestTarget,
                'score' => round($best, 4),
                'flagged' => $isFlagged,
            ];
            $exactCopy = mb_strtolower(trim($source), 'UTF-8') === mb_strtolower(trim($bestTarget), 'UTF-8');
            $ngramCopy = TextProcessor::ngramJaccard($source, $bestTarget, 4) >= 0.9;
            if ($best >= $copyPasteThreshold || $exactCopy || $ngramCopy) {
                $directCopyCount++;
                $directCopyPairs[] = [
                    'source_sentence' => $source,
                    'target_sentence' => $bestTarget,
                    'score' => round($best, 4),
                    'copy_type' => 'direct_copy',
                ];
            }
            $scores[] = $best;
        }

        $overall = count($scores) > 0 ? array_sum($scores) / count($scores) : 0.0;
        $plagiarismScore = count($pairs) > 0 ? ($flagged / count($pairs)) * 100 : 0.0;
        $directCopyPercentage = count($pairs) > 0 ? ($directCopyCount / count($pairs)) * 100 : 0.0;
        $tfidfSimilarity = TextProcessor::cosine($sourceText, $targetText) * 100;
        $aiRewriteLikelihood = max(0.0, min(100.0, ($overall * 100) - $tfidfSimilarity));

        $perplexityProxy = TextProcessor::perplexityProxy($sourceText);
        $burstiness = TextProcessor::sentenceBurstiness($sourceText);
        $entropy = TextProcessor::tokenEntropy($sourceText);
        $tokenCount = count(TextProcessor::tokenize($sourceText));
        $uniqueTokenCount = count(array_unique(TextProcessor::tokenize($sourceText)));
        $ttr = $tokenCount > 0 ? $uniqueTokenCount / $tokenCount : 0.0;

        // Heuristic AI involvement: combines rewrite-like behavior with sentence consistency.
        $sentenceLengthVariance = self::sentenceLengthVariance($sourceSentences);
        $uniformityBoost = max(0.0, min(25.0, 25.0 - ($sentenceLengthVariance * 1.5)));
        $lowBurstinessSignal = max(0.0, min(25.0, 25.0 - ($burstiness * 100.0)));
        $lowEntropySignal = max(0.0, min(20.0, 20.0 - ($entropy * 2.2)));
        $aiInvolvement = max(
            0.0,
            min(100.0, ($aiRewriteLikelihood * 0.45) + $uniformityBoost + $lowBurstinessSignal + $lowEntropySignal + ($plagiarismScore * 0.12))
        );
        $humanWrittenPercentage = max(0.0, 100.0 - $aiInvolvement);
        $humanizedByAi = $aiInvolvement >= 45.0 && $plagiarismScore >= 20.0 && $directCopyPercentage <= 25.0;
        $humanizedReason = $humanizedByAi
            ? 'High semantic overlap with low direct-copy ratio suggests AI-assisted humanized rewriting.'
            : 'No strong AI-humanized rewriting signal detected.';

        return [
            'summary' => [
                'overall_similarity' => round($overall * 100, 2),
                'plagiarism_score' => round($plagiarismScore, 2),
                'direct_copy_percentage' => round($directCopyPercentage, 2),
                'flagged_pairs' => $flagged,
                'total_pairs' => count($pairs),
                'tfidf_similarity' => round($tfidfSimilarity, 2),
                'threshold' => $threshold,
                'ai_rewrite_likelihood' => round($aiRewriteLikelihood, 2),
                'ai_involvement_percentage' => round($aiInvolvement, 2),
                'human_written_percentage' => round($humanWrittenPercentage, 2),
                'perplexity_proxy' => round($perplexityProxy, 3),
                'token_entropy' => round($entropy, 3),
                'sentence_burstiness' => round($burstiness, 3),
                'type_token_ratio' => round($ttr, 3),
                'humanized_by_ai_detected' => $humanizedByAi,
                'humanized_reason' => $humanizedReason,
                'multiple_document_max_similarity' => 0.0,
            ],
            'sentence_pairs' => $pairs,
            'direct_copy_pairs' => $directCopyPairs,
            'similarity_matrix' => $matrix,
        ];
    }

    private static function sentenceLengthVariance(array $sentences): float
    {
        if ($sentences === []) {
            return 0.0;
        }
        $lengths = array_map(static fn ($s) => count(TextProcessor::tokenize((string) $s)), $sentences);
        $mean = array_sum($lengths) / count($lengths);
        if ($mean <= 0.0) {
            return 0.0;
        }
        $sum = 0.0;
        foreach ($lengths as $len) {
            $sum += ($len - $mean) ** 2;
        }
        return sqrt($sum / count($lengths));
    }
}
