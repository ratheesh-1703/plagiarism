<?php

declare(strict_types=1);

use App\Auth;
use App\Config;
use App\Controllers\AuthController;
use App\Controllers\PlagiarismController;
use App\Logger;
use App\RateLimiter;
use App\Response;

require_once __DIR__ . '/../src/Config.php';
require_once __DIR__ . '/../src/Response.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Logger.php';
require_once __DIR__ . '/../src/RateLimiter.php';
require_once __DIR__ . '/../src/TextProcessor.php';
require_once __DIR__ . '/../src/SimilarityService.php';
require_once __DIR__ . '/../src/PublishedSourceService.php';
require_once __DIR__ . '/../src/Controllers/AuthController.php';
require_once __DIR__ . '/../src/Controllers/PlagiarismController.php';

Config::loadEnv(dirname(__DIR__));

$requestId = bin2hex(random_bytes(8));
header('X-Request-Id: ' . $requestId);
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
header('Strict-Transport-Security: max-age=31536000; includeSubDomains');

$allowedOriginsRaw = Config::get('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://localhost:3001,http://localhost:3002');
$allowedOrigins = array_filter(array_map('trim', explode(',', $allowedOriginsRaw)));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Request-Id');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Friendly aliases for manual browser checks.
if ($method === 'GET' && ($uri === '/' || $uri === '/health')) {
    Response::json(['status' => 'ok', 'service' => 'PHP Plagiarism API', 'api_base' => '/api']);
    exit;
}

if (str_starts_with($uri, '/index.php')) {
    $uri = substr($uri, 10) ?: '/';
}
if (!str_starts_with($uri, '/api')) {
    Response::json(['detail' => 'Not Found'], 404);
    exit;
}

$path = substr($uri, 4) ?: '/';
$input = file_get_contents('php://input') ?: '';
$payload = $input !== '' ? json_decode($input, true) : [];
if (!is_array($payload)) {
    $payload = [];
}

$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? null;
$clientIp = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');

if (!RateLimiter::hit('global_' . $clientIp, (int) Config::get('RATE_LIMIT_PER_MINUTE', '120'), 60)) {
    Logger::warning('Global rate limit exceeded', ['ip' => $clientIp, 'path' => $path, 'request_id' => $requestId]);
    Response::json(['detail' => 'Too many requests. Slow down.', 'request_id' => $requestId], 429);
    exit;
}

try {
    if ($method === 'POST' && $path === '/register') {
        if (!RateLimiter::hit('auth_register_' . $clientIp, (int) Config::get('AUTH_RATE_LIMIT_PER_MINUTE', '8'), 60)) {
            Response::json(['detail' => 'Too many registration attempts', 'request_id' => $requestId], 429);
            exit;
        }
        AuthController::register($payload);
        exit;
    }

    if ($method === 'POST' && $path === '/login') {
        if (!RateLimiter::hit('auth_login_' . $clientIp, (int) Config::get('AUTH_RATE_LIMIT_PER_MINUTE', '8'), 60)) {
            Response::json(['detail' => 'Too many login attempts', 'request_id' => $requestId], 429);
            exit;
        }
        AuthController::login($payload);
        exit;
    }

    if ($method === 'GET' && $path === '/health') {
        Response::json(['status' => 'ok', 'service' => 'PHP Plagiarism API']);
        exit;
    }

    $userId = Auth::userIdFromAuthHeader($authHeader);
    if ($userId === null) {
        Logger::warning('Unauthorized request', ['ip' => $clientIp, 'path' => $path, 'request_id' => $requestId]);
        Response::json(['detail' => 'Unauthorized', 'request_id' => $requestId], 401);
        exit;
    }

    if ($method === 'POST' && $path === '/upload-document') {
        PlagiarismController::uploadDocument($userId);
        exit;
    }

    if ($method === 'POST' && $path === '/upload-text') {
        PlagiarismController::uploadText($userId, $payload);
        exit;
    }

    if ($method === 'POST' && $path === '/check-plagiarism') {
        PlagiarismController::checkPlagiarism($userId, $payload);
        exit;
    }

    if ($method === 'GET' && $path === '/history') {
        PlagiarismController::history($userId);
        exit;
    }

    if ($method === 'GET' && $path === '/sources') {
        $platform = (string) ($_GET['platform'] ?? '');
        PlagiarismController::sources($userId, $platform);
        exit;
    }

    if ($method === 'GET' && preg_match('#^/results/(\d+)$#', $path, $m) === 1) {
        PlagiarismController::getResult($userId, (int) $m[1]);
        exit;
    }

    if ($method === 'GET' && preg_match('#^/results/(\d+)/download$#', $path, $m) === 1) {
        PlagiarismController::downloadReport($userId, (int) $m[1]);
        exit;
    }

    Response::json(['detail' => 'Not Found'], 404);
} catch (Throwable $e) {
    Logger::error('Unhandled API error', [
        'request_id' => $requestId,
        'path' => $path,
        'method' => $method,
        'error' => $e->getMessage(),
    ]);
    $debug = Config::get('APP_DEBUG', 'false') === 'true';
    $msg = $debug ? ('Server error: ' . $e->getMessage()) : 'Internal server error';
    Response::json(['detail' => $msg, 'request_id' => $requestId], 500);
}

Logger::info('Request processed', [
    'request_id' => $requestId,
    'path' => $path,
    'method' => $method,
    'ip' => $clientIp,
]);
