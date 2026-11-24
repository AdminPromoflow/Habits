<?php
declare(strict_types=1);
require __DIR__.'/../controller/security/bootstrap.php';
if (PHP_SAPI!=='cli'||!str_starts_with(config('db_name'),'mi_rutina_test_')) throw new RuntimeException('Test database required.');
$db=database();$checks=0;
function rejects(callable $fn): void {global $checks;try{$fn();throw new RuntimeException('Constraint did not reject invalid data.');}catch(PDOException $e){$checks++;}}
$u=$db->all('SELECT id FROM users ORDER BY id LIMIT 2');$a=$u[0]['id'];$b=$u[1]['id'];$h=$db->one('SELECT id,category_id FROM habits WHERE owner_user_id=? LIMIT 1',[$a]);
rejects(fn()=>$db->run('INSERT INTO habit_shares(owner_user_id,recipient_user_id) VALUES (?,?)',[$a,$b]));
rejects(fn()=>$db->run('INSERT INTO habit_shares(owner_user_id,recipient_user_id,habit_id,category_id) VALUES (?,?,?,?)',[$a,$b,$h['id'],$h['category_id']]));
rejects(fn()=>$db->run('INSERT INTO habit_shares(owner_user_id,recipient_user_id,habit_id) VALUES (?,?,?)',[$a,$a,$h['id']]));
rejects(fn()=>$db->run('INSERT INTO habit_completions(habit_id,user_id,completed_on,amount,goal_at_time) VALUES (?,?,?,? ,?)',[$h['id'],$a,'2020-01-01',-1,1]));
rejects(fn()=>$db->run('INSERT INTO user_settings(user_id,language) VALUES (?,?)',[999999,'es']));
$source=json_decode(file_get_contents(__DIR__.'/../database/routine-nov-dec-2026.json'),true);
$sum=0;foreach($source['habits'] as $h){$h['start_date']=$source['start_date'];$h['end_date']=$source['end_date'];for($d=new DateTimeImmutable($h['start_date']);$d->format('Y-m-d')<=$h['end_date'];$d=$d->modify('+1 day'))if(Habits::scheduled($h,$d->format('Y-m-d')))$sum++;}
if($sum!==232)throw new RuntimeException('PDF schedule expected 232 occurrences.');$checks++;
$en=require __DIR__.'/../translations/en.php';$es=require __DIR__.'/../translations/es.php';
if(array_keys($en)!==array_keys($es))throw new RuntimeException('Translation dictionaries differ.');$checks++;
// Exercise actual pre-unification rows, not just the compatibility API alias.
$db->pdo->beginTransaction();
try {
    $model=new MindSpacesModel($db,['id'=>$a]);
    foreach (['kanban','scrum'] as $index=>$kind) {
        $legacy=['cards'=>[['id'=>'20000000-0000-4000-8000-000000000001','title'=>'Existing card','description'=>'Keep me','status'=>$kind==='scrum'?'backlog':'doing','points'=>3]],
            'sprint'=>['name'=>'Existing sprint','goal'=>'Keep this too','start'=>null,'end'=>null]];
        $item=$model->create(['kind'=>$kind,'name'=>'Legacy board','client_key'=>'10000000-0000-4000-8000-00000000000'.($index+1)]);
        $db->run('UPDATE mindspace_items SET kind=?,content_json=? WHERE id=?',[$kind,json_encode($legacy),$item['id']]);
        $read=array_values(array_filter($model->get()['items'],fn($row)=>$row['id']===$item['id']))[0];
        if($read['kind']!=='kanban'||$read['content']['cards']!==$legacy['cards']||$read['content']['sprint']!==$legacy['sprint']
            ||array_column($read['content']['columns'],'name')!==['Pending','To Do','In Progress','Done']) throw new RuntimeException('Legacy board lost content.');
        $model->validateLink(['item_id'=>$item['id'],'target'=>['type'=>'column','id'=>'backlog']]);
        $saved=$model->save(['id'=>$item['id'],'version'=>$item['version'],'content'=>$legacy]);
        if($saved['content']!=$read['content']||$db->one('SELECT kind FROM mindspace_items WHERE id=?',[$item['id']])['kind']!=='kanban') throw new RuntimeException('Legacy save did not preserve the unified board.');
        $checks++;
    }
} finally { $db->pdo->rollBack(); }
echo "$checks schema and source checks passed.\n";
