<?php

declare(strict_types=1);

namespace App;

final class Logger
{
    public static function info(string $message, array $context = []): void
    {
        self::write('INFO', $message, $context);
    }

    public static function warning(string $message, array $context = []): void
    {
        self::write('WARNING', $message, $context);
    }

    public static function error(string $message, array $context = []): void
    {
        self::write('ERROR', $message, $context);
    }

    private static function write(string $level, string $message, array $context): void
    {
        $dir = Config::get('LOG_DIR', 'storage/logs');
        if (!is_dir($dir)) {
            @mkdir($dir, 0777, true);
        }
        $path = rtrim($dir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'app.log';

        $line = json_encode([
            'ts' => gmdate('c'),
            'level' => $level,
            'message' => $message,
            'context' => $context,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if (is_string($line)) {
            @file_put_contents($path, $line . PHP_EOL, FILE_APPEND);
        }
    }
}
