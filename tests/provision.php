<?php
declare(strict_types=1);
require __DIR__.'/../app/bootstrap.php';
$name=getenv('RUTINA_DB_NAME');
if (PHP_SAPI!=='cli' || !preg_match('/^mi_rutina_test_[a-z0-9_]+$/D',$name?:'')) throw new RuntimeException('Only isolated mi_rutina_test_* databases are allowed.');
$c=config(); $host=$c['db_socket']?'unix_socket='.$c['db_socket']:'host='.$c['db_host'].';port='.$c['db_port'];
$pdo=new PDO('mysql:'.$host.';charset=utf8mb4',$c['db_user'],$c['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
require __DIR__.'/../bin/migrate.php';
$db=database();
$db->run('INSERT INTO users(name,email,password_hash) VALUES (?,?,?)',['Aleina','aleinarossui@gmail.com',password_hash('Test-only-password-2026',PASSWORD_DEFAULT)]);$id=$db->id();
$db->run("INSERT INTO user_roles(user_id,role) VALUES (?,'admin'),(?,'user')",[$id,$id]);
$db->run('INSERT INTO user_settings(user_id) VALUES (?)',[$id]);
echo "Isolated test database created.\n";
