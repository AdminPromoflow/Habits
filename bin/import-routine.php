<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require __DIR__.'/../app/bootstrap.php';
$db=database();
$email=Validate::email($argv[1]??'aleinaroseroy@gmail.com');
$file=$argv[2]??__DIR__.'/../database/routine-nov-dec-2026.json';
$doc=json_decode(file_get_contents($file),true,64,JSON_THROW_ON_ERROR);
$u=$db->one('SELECT id FROM users WHERE email=?',[$email]);
if (!$u) throw new RuntimeException('Install the account first.');
$db->transaction(function() use($db,$u,$doc) {
    $db->run('INSERT INTO habit_categories(owner_user_id,name,description,icon,color) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',[$u['id'],$doc['category'],'','dumbbell','#CBE8DD']); $category=$db->id();
    $db->run('INSERT INTO routines(owner_user_id,category_id,name,description,start_date,end_date,source_key) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',[$u['id'],$category,$doc['name'],$doc['description'],Validate::date($doc['start_date']),Validate::date($doc['end_date']),$doc['source_key']]); $routine=$db->id();
    foreach ($doc['habits'] as $i=>$h) {
        $key=$doc['source_key'].':'.$h['source_id'];
        $db->run('INSERT INTO habits(owner_user_id,category_id,routine_id,name,description,goal,unit,schedule_days,scheduled_time,start_date,end_date,section,sort_order,source_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',[$u['id'],$category,$routine,Validate::text($h,'name'),Validate::text($h,'description',5000,false),1,'',Validate::days($h['schedule_days']),$h['scheduled_time'],$doc['start_date'],$doc['end_date'],$h['section'],$i,$key]); $id=$db->id();
        foreach ($h['completions']??[] as $c) {
            // Optional historical import is additive and never overwrites an existing record.
            $db->run('INSERT IGNORE INTO habit_completions(habit_id,user_id,completed_on,amount,goal_at_time,note) VALUES (?,?,?,?,?,?)',[$id,$u['id'],Validate::date($c['date']),Validate::number($c['amount']),1,Validate::text($c,'note',1000,false)]);
        }
    }
});
echo count($doc['habits'])." exercises imported idempotently; existing content and history preserved.\n";
