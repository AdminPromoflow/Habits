<?php
declare(strict_types=1);
require __DIR__.'/../app/bootstrap.php';
if (PHP_SAPI!=='cli' || !str_starts_with((string)config('db_name'),'mi_rutina_test_')) throw new RuntimeException('Isolated tests only.');
$email=$argv[2]??'recovery@example.test';
$db=database();
$u=$db->one('SELECT id,auth_version FROM users WHERE email=?',[$email]);
if (!$u) throw new RuntimeException('Missing test user.');
switch ($argv[1]??'') {
    case 'inspect': echo json_encode($db->all('SELECT token_hash FROM password_resets WHERE user_id=?',[$u['id']])); break;
    case 'expire': $db->run('UPDATE password_resets SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 MINUTE WHERE user_id=?',[$u['id']]); break;
    case 'suspend': $db->run("UPDATE users SET status='suspended' WHERE id=?",[$u['id']]); break;
    case 'setup': $db->run('UPDATE users SET setup_token_hash=?,setup_expires_at=UTC_TIMESTAMP()+INTERVAL 1 DAY WHERE id=?',[hash('sha256','pending-test-setup'),$u['id']]); break;
    default: throw new RuntimeException('Unknown fixture action.');
}
