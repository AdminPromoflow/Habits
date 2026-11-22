<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require __DIR__.'/migrate.php';
$db=database(); $email='aleinaroseroy@gmail.com';
$u=$db->one('SELECT * FROM users WHERE email=?',[$email]);
$token=null;
$db->transaction(function() use($db,$email,&$u,&$token) {
    if (!$u) {
        $token=bin2hex(random_bytes(32));
        $db->run('INSERT INTO users(name,email,password_hash,setup_token_hash,setup_expires_at) VALUES (?,?,?,?,?)',['Aleina',$email,password_hash(bin2hex(random_bytes(32)),PASSWORD_DEFAULT),hash('sha256',$token),gmdate('Y-m-d H:i:s',time()+86400)]);
        $u=$db->one('SELECT * FROM users WHERE id=?',[$db->id()]);
    }
    foreach (['admin','user'] as $role) $db->run('INSERT IGNORE INTO user_roles(user_id,role) VALUES (?,?)',[$u['id'],$role]);
    $db->run('INSERT IGNORE INTO user_settings(user_id) VALUES (?)',[$u['id']]);
});
if ($token) {
    $link=rtrim(config('app_url'),'/').'/#setup='.$token;
    $path=__DIR__.'/../storage/initial-access.txt';
    file_put_contents($path,"Aleina: create your password (one use, expires in 24 hours)\n$link\n"); chmod($path,0600);
    echo "Initial setup link written to storage/initial-access.txt (not committed; not served by HTTP).\n";
} else echo "Aleina already exists; password and history unchanged.\n";
