<?php

declare(strict_types=1);

namespace App;

final class RateLimiter
{
    public static function hit(string $bucketKey, int $maxRequests, int $windowSeconds = 60): bool
    {
        $dir = Config::get('RATE_LIMIT_DIR', 'storage/cache/ratelimits');
        if (!is_dir($dir)) {
            @mkdir($dir, 0777, true);
        }

        $safeKey = preg_replace('/[^a-zA-Z0-9._-]/', '_', $bucketKey) ?: 'default';
        $path = rtrim($dir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $safeKey . '.json';

        $now = time();
        $hits = [];
        if (is_file($path)) {
            $raw = @file_get_contents($path);
            $decoded = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($decoded)) {
                $hits = array_values(array_filter($decoded, static fn ($t) => is_int($t) || ctype_digit((string) $t)));
                $hits = array_map('intval', $hits);
            }
        }

        $hits = array_values(array_filter($hits, static fn (int $ts) => ($now - $ts) < $windowSeconds));
        if (count($hits) >= $maxRequests) {
            @file_put_contents($path, json_encode($hits));
            return false;
        }

        $hits[] = $now;
        @file_put_contents($path, json_encode($hits));
        return true;
    }
}
