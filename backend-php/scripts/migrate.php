<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/Config.php';
require_once __DIR__ . '/../src/Database.php';

use App\Config;
use App\Database;

Config::loadEnv(dirname(__DIR__));
$db = Database::connection();

$db->exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INT AUTO_INCREMENT PRIMARY KEY, version VARCHAR(64) NOT NULL UNIQUE, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');

$migrationDir = dirname(__DIR__) . '/migrations';
$files = glob($migrationDir . '/*.sql');
if ($files === false) {
    fwrite(STDERR, "No migration files found.\n");
    exit(1);
}

sort($files, SORT_STRING);

$getApplied = $db->query('SELECT version FROM schema_migrations');
$applied = [];
if ($getApplied !== false) {
    foreach ($getApplied->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $applied[(string) $row['version']] = true;
    }
}

foreach ($files as $file) {
    $version = basename($file);
    if (isset($applied[$version])) {
        echo "Skipping {$version}\n";
        continue;
    }

    $sql = file_get_contents($file);
    if (!is_string($sql) || trim($sql) === '') {
        echo "Skipping empty migration {$version}\n";
        continue;
    }

    echo "Applying {$version}\n";
    try {
        $statements = preg_split('/;\s*(\r?\n|$)/', $sql) ?: [];
        foreach ($statements as $statement) {
            $statement = trim($statement);
            if ($statement === '') {
                continue;
            }
            $db->exec($statement);
        }
        $insert = $db->prepare('INSERT INTO schema_migrations(version) VALUES(:version)');
        $insert->execute(['version' => $version]);
    } catch (Throwable $e) {
        fwrite(STDERR, "Migration failed ({$version}): {$e->getMessage()}\n");
        exit(1);
    }
}

echo "Migrations complete.\n";
