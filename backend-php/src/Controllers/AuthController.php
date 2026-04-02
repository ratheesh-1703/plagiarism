<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Database;
use App\Response;
use PDO;

final class AuthController
{
    public static function register(array $payload): void
    {
        $name = trim((string) ($payload['name'] ?? ''));
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        $password = (string) ($payload['password'] ?? '');

        if ($name === '' || $email === '' || strlen($password) < 12) {
            Response::json(['detail' => 'Name, email and password(min 12 chars) are required'], 400);
            return;
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::json(['detail' => 'Invalid email format'], 400);
            return;
        }
        if (!preg_match('/[A-Z]/', $password) || !preg_match('/[a-z]/', $password) || !preg_match('/\d/', $password)) {
            Response::json(['detail' => 'Password must contain upper, lower, and numeric characters'], 400);
            return;
        }

        $db = Database::connection();
        $stmt = $db->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => $email]);
        if ($stmt->fetch()) {
            Response::json(['detail' => 'Email is already registered'], 409);
            return;
        }

        $insert = $db->prepare('INSERT INTO users(name, email, password_hash) VALUES(:name, :email, :password_hash)');
        $insert->execute([
            'name' => $name,
            'email' => $email,
            'password_hash' => Auth::hashPassword($password),
        ]);

        $userId = (int) $db->lastInsertId();
        $fetch = $db->prepare('SELECT id, name, email, created_at FROM users WHERE id = :id');
        $fetch->execute(['id' => $userId]);

        Response::json((array) $fetch->fetch(PDO::FETCH_ASSOC));
    }

    public static function login(array $payload): void
    {
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        $password = (string) ($payload['password'] ?? '');

        if ($email === '' || $password === '') {
            Response::json(['detail' => 'Email and password are required'], 400);
            return;
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::json(['detail' => 'Invalid email format'], 400);
            return;
        }

        $db = Database::connection();
        $stmt = $db->prepare('SELECT id, password_hash FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user || !Auth::verifyPassword($password, (string) $user['password_hash'])) {
            Response::json(['detail' => 'Invalid email or password'], 401);
            return;
        }

        Response::json([
            'access_token' => Auth::createToken((int) $user['id']),
            'token_type' => 'bearer',
        ]);
    }
}
