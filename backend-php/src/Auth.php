<?php

declare(strict_types=1);

namespace App;

use Exception;

final class Auth
{
    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    public static function verifyPassword(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    public static function createToken(int $userId): string
    {
        $secret = Config::get('JWT_SECRET', 'dev-secret');
        if (strlen($secret) < 32) {
            throw new Exception('JWT_SECRET must be at least 32 characters in production.');
        }
        $expHours = (int) Config::get('JWT_EXPIRES_HOURS', '24');
        $issuer = Config::get('JWT_ISSUER', 'plagiarism-api');
        $audience = Config::get('JWT_AUDIENCE', 'plagiarism-client');
        $now = time();

        $header = ['alg' => 'HS256', 'typ' => 'JWT'];
        $payload = [
            'sub' => $userId,
            'iss' => $issuer,
            'aud' => $audience,
            'iat' => $now,
            'nbf' => $now,
            'exp' => $now + max(1, $expHours) * 3600,
            'jti' => bin2hex(random_bytes(16)),
        ];

        $headerB64 = self::b64UrlEncode(json_encode($header));
        $payloadB64 = self::b64UrlEncode(json_encode($payload));
        $signature = hash_hmac('sha256', $headerB64 . '.' . $payloadB64, $secret, true);

        return $headerB64 . '.' . $payloadB64 . '.' . self::b64UrlEncode($signature);
    }

    public static function userIdFromAuthHeader(?string $authHeader): ?int
    {
        if ($authHeader === null || !str_starts_with($authHeader, 'Bearer ')) {
            return null;
        }
        $token = substr($authHeader, 7);
        return self::verifyToken($token);
    }

    private static function verifyToken(string $token): ?int
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        [$headerB64, $payloadB64, $signatureB64] = $parts;
        $secret = Config::get('JWT_SECRET', 'dev-secret');
        $issuer = Config::get('JWT_ISSUER', 'plagiarism-api');
        $audience = Config::get('JWT_AUDIENCE', 'plagiarism-client');

        $expected = self::b64UrlEncode(hash_hmac('sha256', $headerB64 . '.' . $payloadB64, $secret, true));
        if (!hash_equals($expected, $signatureB64)) {
            return null;
        }

        try {
            $payload = json_decode(self::b64UrlDecode($payloadB64), true, 512, JSON_THROW_ON_ERROR);
        } catch (Exception) {
            return null;
        }

        if (
            !isset($payload['sub'], $payload['exp'], $payload['iss'], $payload['aud'], $payload['nbf'], $payload['iat'])
            || (int) $payload['exp'] < time()
            || (int) $payload['nbf'] > time()
            || (string) $payload['iss'] !== $issuer
            || (string) $payload['aud'] !== $audience
        ) {
            return null;
        }

        return (int) $payload['sub'];
    }

    private static function b64UrlEncode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    private static function b64UrlDecode(string $encoded): string
    {
        $padding = strlen($encoded) % 4;
        if ($padding > 0) {
            $encoded .= str_repeat('=', 4 - $padding);
        }
        return base64_decode(strtr($encoded, '-_', '+/')) ?: '';
    }
}
