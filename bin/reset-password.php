<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require __DIR__.'/../controller/security/bootstrap.php';
$email=Validate::email($argv[1]??'');
$db=database(); $u=$db->one('SELECT id FROM users WHERE email=?',[$email]);
if (!$u) { fwrite(STDERR,"Account not found.\n"); exit(1); }
$token=bin2hex(random_bytes(32));
$db->run('UPDATE users SET setup_token_hash=?,setup_expires_at=?,auth_version=auth_version+1 WHERE id=?',[hash('sha256',$token),gmdate('Y-m-d H:i:s',time()+3600),$u['id']]);
echo rtrim(config('app_url'),'/').'/#setup='.$token."\n";
