<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require_once __DIR__.'/../app/bootstrap.php';
if (PHP_VERSION_ID<80200) { fwrite(STDERR,"PHP 8.2+ required.\n"); exit(1); }
$db=database();
$lock=$db->one("SELECT GET_LOCK(CONCAT(DATABASE(),':migrations'),10) AS acquired");
if (!$lock['acquired']) throw new RuntimeException('Migration lock unavailable.');
try {
    $db->run('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(190) PRIMARY KEY,checksum CHAR(64) NOT NULL,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
    foreach (glob(__DIR__.'/../database/migrations/*.sql') as $file) {
        $version=basename($file); $checksum=hash_file('sha256',$file);
        $existing=$db->one('SELECT checksum FROM schema_migrations WHERE version=?',[$version]);
        if ($existing) { if (!hash_equals($existing['checksum'],$checksum)) throw new RuntimeException('Applied migration changed: '.$version); continue; }
        foreach (preg_split('/;\s*(?:\r?\n|$)/',file_get_contents($file)) as $sql) if (trim($sql)!=='') $db->run($sql);
        $db->run('INSERT INTO schema_migrations(version,checksum) VALUES (?,?)',[$version,$checksum]);
        echo "Applied $version\n";
    }
    foreach (glob(__DIR__.'/../database/seeds/*.sql') as $file) foreach (preg_split('/;\s*(?:\r?\n|$)/',file_get_contents($file)) as $sql) if (trim($sql)!=='') $db->run($sql);
    echo "Database ready; existing records preserved.\n";
} finally { $db->run("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':migrations'))"); }
