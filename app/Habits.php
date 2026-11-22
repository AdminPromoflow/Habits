<?php
declare(strict_types=1);
final class Habits {
    private const RANK = ['viewer'=>1,'participant'=>2,'editor'=>3,'owner'=>4];
    private const VIS = ['none'=>0,'summary'=>1,'detailed'=>2];
    public function __construct(public DB $db, public array $user) {}
    public function uid(): int { return (int)$this->user['id']; }
    public function today(): string { return (new DateTimeImmutable('now',new DateTimeZone($this->user['timezone'])))->format('Y-m-d'); }
    public function admin(): void { if (!in_array('admin',$this->user['roles'],true)) fail('error_forbidden',403); }
    public function category(int $id, ?int $owner = null): array {
        $c=$this->db->one('SELECT * FROM habit_categories WHERE id=? AND (owner_user_id IS NULL OR owner_user_id=?)',[$id,$owner??$this->uid()]);
        if (!$c) fail('error_not_found',404); return $c;
    }
    // Every access is derived from active server-side grants, never from the UI or collaborator cache.
    public function grants(array $h, int $uid, bool $lock = false): array {
        return $this->db->all("SELECT s.* FROM habit_shares s JOIN users u ON u.id=s.owner_user_id AND u.status='active'
          WHERE s.recipient_user_id=? AND s.owner_user_id=? AND s.status='accepted'
          AND (s.habit_id=? OR (s.category_id=? AND (s.include_future=1 OR EXISTS(SELECT 1 FROM share_habits sh WHERE sh.share_id=s.id AND sh.habit_id=?))))".($lock?' FOR UPDATE':''),[$uid,$h['owner_user_id'],$h['id'],$h['category_id'],$h['id']]);
    }
    public function access(array $h, ?int $uid = null, bool $lock = false): array {
        $uid??=$this->uid();
        if ((int)$h['owner_user_id']===$uid) return ['permission'=>'owner','progress_visibility'=>'detailed'];
        $grants=$this->grants($h,$uid,$lock);
        if (!$grants) fail('error_not_found',404);
        $permission='viewer'; $visibility='none';
        foreach ($grants as $s) {
            if (self::RANK[$s['permission']]>self::RANK[$permission]) $permission=$s['permission'];
            if (self::VIS[$s['progress_visibility']]>self::VIS[$visibility]) $visibility=$s['progress_visibility'];
        }
        return ['permission'=>$permission,'progress_visibility'=>$visibility];
    }
    public function habit(int $id, string $need='viewer', bool $lock=false): array {
        $h=$this->db->one('SELECT h.*,u.name AS owner_name,c.name AS category_name,c.translation_key AS category_key,c.color,c.icon FROM habits h JOIN users u ON u.id=h.owner_user_id JOIN habit_categories c ON c.id=h.category_id WHERE h.id=?'.($lock?' FOR UPDATE':''),[$id]);
        if (!$h) fail('error_not_found',404);
        $a=$this->access($h,null,$lock);
        if (self::RANK[$a['permission']]<self::RANK[$need]) fail('error_forbidden',403);
        return array_merge($h,$a);
    }
    public function list(): array {
        $rows=$this->db->all("SELECT h.*,u.name AS owner_name,c.name AS category_name,c.translation_key AS category_key,c.color,c.icon,r.name AS routine_name
          FROM habits h JOIN users u ON u.id=h.owner_user_id JOIN habit_categories c ON c.id=h.category_id LEFT JOIN routines r ON r.id=h.routine_id
          WHERE h.owner_user_id=? OR (u.status='active' AND EXISTS(SELECT 1 FROM habit_shares s WHERE s.recipient_user_id=? AND s.owner_user_id=h.owner_user_id AND s.status='accepted' AND
          (s.habit_id=h.id OR (s.category_id=h.category_id AND (s.include_future=1 OR EXISTS(SELECT 1 FROM share_habits sh WHERE sh.share_id=s.id AND sh.habit_id=h.id))))))
          ORDER BY h.sort_order,h.scheduled_time,h.id",[$this->uid(),$this->uid()]);
        foreach ($rows as &$h) {
            $h=array_merge($h,$this->access($h));
            $h['schedule_days']=json_decode($h['schedule_days'],true);
            $h['progress_consent']=$this->db->one('SELECT progress_consent FROM habit_collaborators WHERE habit_id=? AND user_id=?',[$h['id'],$this->uid()])['progress_consent']??'none';
        }
        return $rows;
    }
    public function data(): array {
        $habits=$this->list(); $ids=array_column($habits,'id');
        $completions=$ids ? $this->db->all('SELECT habit_id,completed_on,amount,goal_at_time,note FROM habit_completions WHERE user_id=? AND habit_id IN ('.implode(',',array_fill(0,count($ids),'?')).') ORDER BY completed_on',array_merge([$this->uid()],$ids)) : [];
        return [
          'today'=>$this->today(),'habits'=>$habits,'completions'=>$completions,
          'categories'=>$this->db->all('SELECT id,owner_user_id,name,translation_key,description,icon,color FROM habit_categories WHERE owner_user_id IS NULL OR owner_user_id=? ORDER BY owner_user_id IS NOT NULL DESC,id',[$this->uid()]),
          'routines'=>$this->db->all('SELECT * FROM routines WHERE owner_user_id=? ORDER BY id',[$this->uid()]),
          'requests'=>$this->db->all('SELECT * FROM category_requests WHERE user_id=? ORDER BY id DESC',[$this->uid()]),
          'templates'=>$this->db->all('SELECT * FROM habit_templates WHERE active=1 ORDER BY id'),
          'notifications'=>$this->db->all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50',[$this->uid()]),
          'weights'=>$this->db->all('SELECT recorded_on,weight_kg FROM wellness_entries WHERE user_id=? ORDER BY recorded_on',[$this->uid()]),
          'outgoing'=>$this->db->all('SELECT r.id,r.recipient_email,r.permission,r.progress_visibility,r.include_future,r.status,r.invitation_message,r.created_at,r.habit_id,r.category_id,COALESCE(h.name,c.name) AS resource_name,c.translation_key AS category_key FROM invitation_receipts r LEFT JOIN habits h ON h.id=r.habit_id LEFT JOIN habit_categories c ON c.id=r.category_id WHERE r.owner_user_id=? ORDER BY r.id DESC',[$this->uid()]),
          'incoming'=>$this->db->all("SELECT s.id,s.owner_user_id,s.permission,s.progress_visibility,s.include_future,s.status,s.invitation_message,s.created_at,s.habit_id,s.category_id,u.name AS owner_name,CASE WHEN s.status IN ('pending','accepted') THEN COALESCE(h.name,c.name) ELSE NULL END AS resource_name,c.translation_key AS category_key FROM habit_shares s JOIN users u ON u.id=s.owner_user_id LEFT JOIN habits h ON h.id=s.habit_id LEFT JOIN habit_categories c ON c.id=s.category_id WHERE s.recipient_user_id=? AND u.status='active' ORDER BY s.id DESC",[$this->uid()])
        ];
    }
    public function saveHabit(array $d): int {
        $id=(int)($d['id']??0); $old=$id?$this->habit($id,'editor',true):null;
        $owner=$old?(int)$old['owner_user_id']:$this->uid();
        $category=(int)($d['category_id']??$old['category_id']??0); $this->category($category,$owner);
        $routine=!empty($d['routine_id'])?(int)$d['routine_id']:null;
        if ($old && $old['permission']!=='owner') { $category=(int)$old['category_id']; $routine=$old['routine_id']; }
        if ($routine && !$this->db->one('SELECT id FROM routines WHERE id=? AND owner_user_id=? AND category_id=?',[$routine,$owner,$category])) fail('error_validation');
        $name=Validate::text($d,'name'); $description=Validate::text($d,'description',5000,false);
        $goal=Validate::number($d['goal']??1,0.01); $unit=Validate::text($d,'unit',40,false); $days=Validate::days($d['schedule_days']??[1,2,3,4,5,6,7]);
        $start=Validate::date($d['start_date']??$this->today()); $end=!empty($d['end_date'])?Validate::date($d['end_date']):null;
        if ($end && $end<$start) fail('error_date');
        $time=$d['scheduled_time']??null;
        if ($time==='') $time=null;
        if ($time!==null && (!is_string($time)||!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/D',$time))) fail('error_validation');
        $section=Validate::text($d,'section',150,false);
        if ($old) {
            $this->db->run('UPDATE habits SET name=?,description=?,category_id=?,routine_id=?,goal=?,unit=?,schedule_days=?,scheduled_time=?,start_date=?,end_date=?,section=? WHERE id=?',[$name,$description,$category,$routine,$goal,$unit,$days,$time,$start,$end,$section,$id]);
            if ($category!=(int)$old['category_id']) {
                // A snapshot never revives a moved-away habit when it is later moved back.
                $this->db->run('DELETE sh FROM share_habits sh JOIN habit_shares s ON s.id=sh.share_id WHERE sh.habit_id=? AND s.category_id IS NOT NULL',[$id]);
            }
            $this->activity($id,'habit_updated');
        } else {
            $this->db->run('INSERT INTO habits(owner_user_id,category_id,routine_id,name,description,goal,unit,schedule_days,scheduled_time,start_date,end_date,section) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[$owner,$category,$routine,$name,$description,$goal,$unit,$days,$time,$start,$end,$section]); $id=$this->db->id();
        }
        $this->syncCollaborators(); return $id;
    }
    public function archiveHabit(array $d): void {
        $h=$this->habit((int)($d['id']??0),'owner',true);
        $status=Validate::choice($d['status']??'archived',['active','archived']);
        $this->db->run('UPDATE habits SET status=? WHERE id=?',[$status,$h['id']]);
    }
    public static function scheduled(array $h,string $date): bool {
        $days=is_array($h['schedule_days'])?$h['schedule_days']:json_decode($h['schedule_days'],true);
        return $date >= $h['start_date'] && (!$h['end_date'] || $date <= $h['end_date']) && in_array((int)(new DateTimeImmutable($date))->format('N'),$days,true);
    }
    public function complete(array $d): void {
        $h=$this->habit((int)($d['habit_id']??0),'participant',true);
        if (isset($d['user_id']) && (int)$d['user_id']!==$this->uid()) fail('error_forbidden',403);
        $date=Validate::date($d['date']??$this->today());
        if ($date>$this->today() || !self::scheduled($h,$date) || $h['status']!=='active') fail('error_date');
        if ($h['permission']!=='owner') {
            $joined=$this->db->one('SELECT DATE(joined_at) AS joined FROM habit_collaborators WHERE habit_id=? AND user_id=?',[$h['id'],$this->uid()]);
            if (!$joined || $date<$joined['joined']) fail('error_date');
        }
        $amount=Validate::number($d['amount']??$h['goal']); $note=Validate::text($d,'note',1000,false);
        if ($amount===0.0) $this->db->run('DELETE FROM habit_completions WHERE habit_id=? AND user_id=? AND completed_on=?',[$h['id'],$this->uid(),$date]);
        else $this->db->run('INSERT INTO habit_completions(habit_id,user_id,completed_on,amount,goal_at_time,note) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE amount=VALUES(amount),note=VALUES(note)',[$h['id'],$this->uid(),$date,$amount,$h['goal'],$note]);
        // No progress values are placed in a shared activity feed.
    }
    public function saveCategory(array $d,bool $global=false): int {
        if ($global) $this->admin();
        $id=(int)($d['id']??0); $owner=$global?null:$this->uid();
        if ($id) { $c=$this->category($id); if ($c['owner_user_id']!==$owner) fail('error_forbidden',403); }
        $name=trim(Validate::text($d,'name',100)); $desc=Validate::text($d,'description',2000,false);
        $icon=Validate::choice($d['icon']??'sparkles',['sparkles','dumbbell','flower','book','heart','leaf','sun','moon','coffee','music','briefcase']); $color=Validate::color($d['color']??'#B8A4D4');
        if ($id) $this->db->run('UPDATE habit_categories SET name=?,translation_key=NULL,description=?,icon=?,color=? WHERE id=?',[$name,$desc,$icon,$color,$id]);
        else { $this->db->run('INSERT INTO habit_categories(owner_user_id,name,description,icon,color) VALUES (?,?,?,?,?)',[$owner,$name,$desc,$icon,$color]); $id=$this->db->id(); }
        return $id;
    }
    public function deleteCategory(array $d, bool $global=false): void {
        if ($global) $this->admin(); $c=$this->category((int)($d['id']??0));
        if ($c['owner_user_id']!==($global?null:$this->uid())) fail('error_forbidden',403);
        if ($this->db->one('SELECT id FROM habits WHERE category_id=? LIMIT 1',[$c['id']]) || $this->db->one('SELECT id FROM habit_shares WHERE category_id=? LIMIT 1',[$c['id']]) || $this->db->one('SELECT id FROM routines WHERE category_id=? LIMIT 1',[$c['id']]) || $this->db->one('SELECT id FROM habit_templates WHERE category_id=? LIMIT 1',[$c['id']]) || $this->db->one('SELECT id FROM invitation_receipts WHERE category_id=? LIMIT 1',[$c['id']])) fail('error_category_used');
        $this->db->run('DELETE FROM habit_categories WHERE id=?',[$c['id']]);
    }
    public function saveRoutine(array $d): int {
        $category=(int)($d['category_id']??0); $this->category($category);
        $name=Validate::text($d,'name'); $desc=Validate::text($d,'description',3000,false);
        $start=Validate::date($d['start_date']??$this->today()); $end=!empty($d['end_date'])?Validate::date($d['end_date']):null;
        if ($end && $end<$start) fail('error_date');
        $this->db->run('INSERT INTO routines(owner_user_id,category_id,name,description,start_date,end_date) VALUES (?,?,?,?,?,?)',[$this->uid(),$category,$name,$desc,$start,$end]); return $this->db->id();
    }
    public function requestCategory(array $d): void {
        $name=trim(Validate::text($d,'name',100)); $desc=Validate::text($d,'description',2000,false); $reason=Validate::text($d,'reason',2000);
        $icon=Validate::choice($d['icon']??'sparkles',['sparkles','dumbbell','flower','book','heart','leaf','sun','moon','coffee','music','briefcase']); $color=Validate::color($d['color']??'#B8A4D4');
        if ($this->db->one("SELECT id FROM habit_categories WHERE owner_user_id IS NULL AND name=?",[$name]) || $this->db->one("SELECT id FROM category_requests WHERE user_id=? AND name=? AND status='pending'",[$this->uid(),$name])) fail('error_duplicate');
        $this->db->run('INSERT INTO category_requests(user_id,name,description,icon,color,reason) VALUES (?,?,?,?,?,?)',[$this->uid(),$name,$desc,$icon,$color,$reason]);
    }
    public function reviewCategory(array $d): void {
        $this->admin(); $r=$this->db->one('SELECT * FROM category_requests WHERE id=? FOR UPDATE',[(int)($d['id']??0)]);
        if (!$r || $r['status']!=='pending') fail('error_not_found',404);
        $status=Validate::choice($d['status']??'',['approved','rejected']); $feedback=Validate::text($d,'feedback',1000,$status==='rejected');
        if ($status==='approved') { $category=$r; unset($category['id']); $this->saveCategory($category,true); }
        $this->db->run('UPDATE category_requests SET status=?,feedback=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE id=?',[$status,$feedback,$this->uid(),$r['id']]);
        $this->notify((int)$r['user_id'],'notification_category_'.$status,$r['name'].($feedback?' — '.$feedback:''));
    }
    public function notify(int $uid,string $key,string $detail=''): void {
        $enabled=$this->db->one('SELECT notifications_enabled FROM user_settings WHERE user_id=?',[$uid]);
        if ($enabled && $enabled['notifications_enabled']) $this->db->run('INSERT INTO notifications(user_id,message_key,detail) VALUES (?,?,?)',[$uid,$key,$detail]);
    }
    public function activity(int $habit,string $action): void {
        $this->db->run("INSERT INTO collaboration_activity(habit_id,user_id,action,description) VALUES (?,?,?,'')",[$habit,$this->uid(),$action]);
    }
    public function share(array $d): void {
        $email=Validate::email($d['email']??null);
        $permission=Validate::choice($d['permission']??'viewer',['viewer','participant','editor']);
        $visibility=Validate::choice($d['progress_visibility']??'none',['none','summary','detailed']);
        $message=Validate::text($d,'invitation_message',1000,false);
        $category=!empty($d['category_id'])?(int)$d['category_id']:null;
        $ids=$d['habit_ids']??[];
        if (!is_array($ids) || count($ids)>50 || (($category!==null) === (count($ids)>0))) fail('error_validation');
        $resources=[];
        if ($category) { $this->category($category); $resources[]=['habit'=>null,'category'=>$category]; }
        else foreach (array_unique($ids) as $id) { $this->habit((int)$id,'owner',true); $resources[]=['habit'=>(int)$id,'category'=>null]; }
        $recipient=$this->db->one("SELECT id FROM users WHERE email=? AND status='active'",[$email]);
        // Opaque receipts exist for all addresses, including unknown ones. Pending lists never disclose account existence.
        foreach ($resources as $r) {
            $existing=$this->db->one("SELECT id FROM invitation_receipts WHERE owner_user_id=? AND recipient_email=? AND status IN ('pending','accepted') AND habit_id <=> ? AND category_id <=> ? FOR UPDATE",[$this->uid(),$email,$r['habit'],$r['category']]);
            if ($existing) continue;
            $future=$category && !empty($d['include_future'])?1:0;
            $shareId=null;
            if ($recipient && (int)$recipient['id']!==$this->uid()) {
                $this->db->run('INSERT INTO habit_shares(owner_user_id,recipient_user_id,habit_id,category_id,permission,progress_visibility,include_future,invitation_message) VALUES (?,?,?,?,?,?,?,?)',[$this->uid(),$recipient['id'],$r['habit'],$r['category'],$permission,$visibility,$future,$message]); $shareId=$this->db->id();
                if ($category) $this->db->run('INSERT INTO share_habits(share_id,habit_id) SELECT ?,id FROM habits WHERE owner_user_id=? AND category_id=?',[$shareId,$this->uid(),$category]);
                $this->notify((int)$recipient['id'],'notification_invitation');
            }
            $this->db->run('INSERT INTO invitation_receipts(owner_user_id,share_id,recipient_email,habit_id,category_id,permission,progress_visibility,include_future,invitation_message) VALUES (?,?,?,?,?,?,?,?,?)',[$this->uid(),$shareId,$email,$r['habit'],$r['category'],$permission,$visibility,$future,$message]);
        }
    }
    public function respond(array $d): void {
        $s=$this->db->one('SELECT * FROM habit_shares WHERE id=? AND recipient_user_id=? FOR UPDATE',[(int)($d['id']??0),$this->uid()]);
        if (!$s || $s['status']!=='pending') fail('error_not_found',404);
        $status=Validate::choice($d['status']??'',['accepted','declined']);
        $this->db->run('UPDATE habit_shares SET status=?,responded_at=UTC_TIMESTAMP() WHERE id=?',[$status,$s['id']]);
        $this->db->run('UPDATE invitation_receipts SET status=? WHERE share_id=?',[$status,$s['id']]);
        $this->syncCollaborators();
        $this->notify((int)$s['owner_user_id'],'notification_invitation_'.$status,$this->user['name']);
    }
    public function changeShare(array $d): void {
        $r=$this->db->one('SELECT * FROM invitation_receipts WHERE id=? AND owner_user_id=? FOR UPDATE',[(int)($d['id']??0),$this->uid()]);
        if (!$r || !in_array($r['status'],['pending','accepted'],true)) fail('error_not_found',404);
        if (($d['status']??null)==='revoked') {
            if ($r['share_id']) $this->db->run("UPDATE habit_shares SET status='revoked',responded_at=UTC_TIMESTAMP() WHERE id=?",[$r['share_id']]);
            $this->db->run("UPDATE invitation_receipts SET status='revoked' WHERE id=?",[$r['id']]);
        } else {
            $permission=Validate::choice($d['permission']??$r['permission'],['viewer','participant','editor']);
            $visibility=Validate::choice($d['progress_visibility']??$r['progress_visibility'],['none','summary','detailed']);
            $future=$r['category_id'] && !empty($d['include_future'])?1:0;
            if ($r['share_id']) $this->db->run('UPDATE habit_shares SET permission=?,progress_visibility=?,include_future=? WHERE id=?',[$permission,$visibility,$future,$r['share_id']]);
            $this->db->run('UPDATE invitation_receipts SET permission=?,progress_visibility=?,include_future=? WHERE id=?',[$permission,$visibility,$future,$r['id']]);
        }
        $this->syncCollaborators();
    }
    public function leaveShare(array $d): void {
        $s=$this->db->one("SELECT * FROM habit_shares WHERE id=? AND recipient_user_id=? AND status='accepted' FOR UPDATE",[(int)($d['id']??0),$this->uid()]);
        if (!$s) fail('error_not_found',404);
        $this->db->run("UPDATE habit_shares SET status='revoked',responded_at=UTC_TIMESTAMP() WHERE id=?",[$s['id']]);
        $this->db->run("UPDATE invitation_receipts SET status='revoked' WHERE share_id=?",[$s['id']]);
        $this->syncCollaborators();
    }
    public function syncCollaborators(): void {
        // Derived membership is only a cache; authorization always rechecks the original grant.
        $shares=$this->db->all("SELECT s.* FROM habit_shares s JOIN users u ON u.id=s.owner_user_id JOIN users r ON r.id=s.recipient_user_id WHERE s.status='accepted' AND s.permission IN ('participant','editor') AND u.status='active' AND r.status='active' AND (s.owner_user_id=? OR s.recipient_user_id=?)",[$this->uid(),$this->uid()]);
        foreach ($shares as $s) {
            $habits=$this->db->all('SELECT h.id FROM habits h WHERE h.owner_user_id=? AND (h.id=? OR (h.category_id=? AND (?=1 OR EXISTS(SELECT 1 FROM share_habits sh WHERE sh.share_id=? AND sh.habit_id=h.id))))',[$s['owner_user_id'],$s['habit_id'],$s['category_id'],$s['include_future'],$s['id']]);
            foreach ($habits as $h) $this->db->run('INSERT INTO habit_collaborators(habit_id,user_id,share_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE share_id=VALUES(share_id)',[$h['id'],$s['recipient_user_id'],$s['id']]);
        }
        // Keep historical membership/consent and independent logs after revocation, but do not expose or authorize via them.
    }
    public function consent(array $d): void {
        $h=$this->habit((int)($d['habit_id']??0),'participant',true);
        if ($h['permission']==='owner') fail('error_validation');
        $consent=Validate::choice($d['progress_consent']??'none',['none','summary','detailed']);
        $this->db->run('UPDATE habit_collaborators SET progress_consent=? WHERE habit_id=? AND user_id=?',[$consent,$h['id'],$this->uid()]);
    }
    public function group(array $d): array {
        $h=$this->habit((int)($d['habit_id']??0));
        $end=Validate::date($d['end']??$this->today()); $start=Validate::date($d['start']??(new DateTimeImmutable($end))->modify('-29 days')->format('Y-m-d'));
        if ($end>$this->today() || $start>$end || (new DateTimeImmutable($start))->diff(new DateTimeImmutable($end))->days>365) fail('error_date');
        $members=[['user_id'=>(int)$h['owner_user_id'],'name'=>$h['owner_name'],'progress_consent'=>'detailed','joined_at'=>$h['start_date']]];
        foreach ($this->db->all("SELECT c.*,u.name FROM habit_collaborators c JOIN users u ON u.id=c.user_id AND u.status='active' WHERE c.habit_id=?",[$h['id']]) as $member) {
            try { $a=$this->access($h,(int)$member['user_id']); if (self::RANK[$a['permission']]>=2) $members[]=$member; } catch (AppError $e) { /* Revoked membership contributes nothing. */ }
        }
        $out=[]; $rates=[];
        foreach ($members as $member) {
            $uid=(int)$member['user_id'];
            $vis=$uid===$this->uid()?'detailed':$member['progress_consent'];
            if ($uid!==$this->uid() && $h['permission']!=='owner' && self::VIS[$h['progress_visibility']]<self::VIS[$vis]) $vis=$h['progress_visibility'];
            $item=['user_id'=>$uid,'name'=>$member['name'],'visibility'=>$vis];
            if ($vis!=='none') {
                $from=max($start,$h['start_date'],substr($member['joined_at'],0,10)); $expected=0;
                for ($date=new DateTimeImmutable($from);$date->format('Y-m-d')<=$end;$date=$date->modify('+1 day')) if (self::scheduled($h,$date->format('Y-m-d'))) $expected++;
                $rows=$this->db->all('SELECT completed_on,amount,goal_at_time FROM habit_completions WHERE habit_id=? AND user_id=? AND completed_on BETWEEN ? AND ?',[$h['id'],$uid,$from,$end]);
                $done=0; $fraction=0;
                foreach ($rows as $row) if (self::scheduled($h,$row['completed_on'])) { $fraction+=min(1,(float)$row['amount']/(float)$row['goal_at_time']); if ($row['amount'] >= $row['goal_at_time']) $done++; }
                $item+=['completed'=>$done,'expected'=>$expected,'percent'=>$expected?round($fraction/$expected*100,1):0];
                if ($vis==='detailed') $item['history']=$rows;
                if ($expected) $rates[]=$item['percent'];
            }
            $out[]=$item;
        }
        return ['members'=>$out,'average'=>$rates?round(array_sum($rates)/count($rates),1):null,'visible_count'=>count($rates),'start'=>$start,'end'=>$end];
    }
    public function settings(array $d): void {
        $language=Validate::choice($d['language']??$this->user['language'],['en','es']);
        $timezone=Validate::choice($d['timezone']??$this->user['timezone'],DateTimeZone::listIdentifiers());
        $theme=Validate::choice($d['theme']??$this->user['theme'],['light','dark']);
        $notifications=array_key_exists('notifications_enabled',$d)?(int)(bool)$d['notifications_enabled']:(int)$this->user['notifications_enabled'];
        $this->db->run('UPDATE user_settings SET language=?,timezone=?,theme=?,notifications_enabled=? WHERE user_id=?',[$language,$timezone,$theme,$notifications,$this->uid()]);
        if (isset($d['name'])) $this->db->run('UPDATE users SET name=? WHERE id=?',[Validate::text($d,'name',100),$this->uid()]);
        languageCookie($language);
    }
    public function password(array $d): void {
        $u=$this->db->one('SELECT password_hash FROM users WHERE id=? FOR UPDATE',[$this->uid()]);
        if (!password_verify(Validate::text($d,'current_password',72),$u['password_hash'])) fail('error_login',403);
        $password=Validate::password($d['password']??null);
        $this->db->run('UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$this->uid()]);
        $_SESSION['auth_version']++; session_regenerate_id(true);
    }
    public function weight(array $d): void {
        $date=Validate::date($d['date']??$this->today()); if ($date>$this->today()) fail('error_date');
        $weight=Validate::number($d['weight_kg']??null,1,500);
        $this->db->run('INSERT INTO wellness_entries(user_id,recorded_on,weight_kg) VALUES (?,?,?) ON DUPLICATE KEY UPDATE weight_kg=VALUES(weight_kg)',[$this->uid(),$date,$weight]);
    }
    public function adminData(): array {
        $this->admin();
        return [
          'users'=>$this->db->all("SELECT u.id,u.name,u.email,u.status,u.created_at,GROUP_CONCAT(r.role ORDER BY r.role) AS roles FROM users u LEFT JOIN user_roles r ON r.user_id=u.id GROUP BY u.id ORDER BY u.id"),
          'categories'=>$this->db->all('SELECT id,name,translation_key,description,icon,color FROM habit_categories WHERE owner_user_id IS NULL ORDER BY id'),
          'requests'=>$this->db->all('SELECT r.*,u.name AS requester FROM category_requests r JOIN users u ON u.id=r.user_id ORDER BY r.id DESC'),
          'templates'=>$this->db->all('SELECT * FROM habit_templates ORDER BY id'),
          'settings'=>array_column($this->db->all('SELECT * FROM platform_settings'),'setting_value','setting_key'),
          // Aggregate counts only: no private habit titles, descriptions, personal categories or user progress.
          'statistics'=>[
            'users'=>(int)$this->db->one('SELECT COUNT(*) AS n FROM users')['n'],
            'habits'=>(int)$this->db->one('SELECT COUNT(*) AS n FROM habits')['n'],
            'completions'=>(int)$this->db->one('SELECT COUNT(*) AS n FROM habit_completions WHERE amount>=goal_at_time')['n'],
            'collaborations'=>(int)$this->db->one("SELECT COUNT(*) AS n FROM habit_shares WHERE status='accepted'")['n'],
            'pending'=>(int)$this->db->one("SELECT COUNT(*) AS n FROM category_requests WHERE status='pending'")['n'],
            'weekly'=>$this->db->all('SELECT DATE(created_at) AS date,COUNT(*) AS total FROM users WHERE created_at>=UTC_TIMESTAMP()-INTERVAL 30 DAY GROUP BY DATE(created_at)')
          ]
        ];
    }
    public function manageUser(array $d): void {
        $this->admin(); $id=(int)($d['id']??0);
        // Serialize admin mutations so concurrent demotions cannot remove the last administrator.
        $admins=$this->db->all("SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='admin' AND u.status='active' FOR UPDATE");
        $u=$this->db->one('SELECT id FROM users WHERE id=? FOR UPDATE',[$id]); if (!$u) fail('error_not_found',404);
        $status=Validate::choice($d['status']??'active',['active','suspended']); $admin=!empty($d['admin']);
        if ($id===$this->uid() && ($status!=='active' || !$admin)) fail('error_self_admin');
        if (count($admins)===1 && (int)$admins[0]['id']===$id && (!$admin || $status!=='active')) fail('error_self_admin');
        $this->db->run('UPDATE users SET status=?,auth_version=auth_version+1 WHERE id=?',[$status,$id]);
        if ($admin) $this->db->run("INSERT IGNORE INTO user_roles(user_id,role) VALUES (?,'admin')",[$id]);
        else $this->db->run("DELETE FROM user_roles WHERE user_id=? AND role='admin'",[$id]);
        $this->db->run("INSERT IGNORE INTO user_roles(user_id,role) VALUES (?,'user')",[$id]);
        if ($id===$this->uid()) $_SESSION['auth_version']++;
    }
    public function saveTemplate(array $d): void {
        $this->admin(); $id=(int)($d['id']??0); $category=$this->category((int)($d['category_id']??0));
        if ($category['owner_user_id']!==null) fail('error_validation');
        $values=[$category['id'],Validate::text($d,'name'),Validate::text($d,'description',3000,false),Validate::number($d['goal']??1,0.01),Validate::text($d,'unit',40,false),Validate::days($d['schedule_days']??[1,2,3,4,5,6,7]),(int)!empty($d['active'])];
        if ($id) $this->db->run('UPDATE habit_templates SET category_id=?,name=?,description=?,goal=?,unit=?,schedule_days=?,active=?,translation_key=NULL WHERE id=?',array_merge($values,[$id]));
        else $this->db->run('INSERT INTO habit_templates(category_id,name,description,goal,unit,schedule_days,active) VALUES (?,?,?,?,?,?,?)',$values);
    }
    public function platform(array $d): void {
        $this->admin();
        $this->db->run("UPDATE platform_settings SET setting_value=? WHERE setting_key='registration_enabled'",[!empty($d['registration_enabled'])?'1':'0']);
        $this->db->run("UPDATE platform_settings SET setting_value=? WHERE setting_key='platform_name'",[Validate::text($d,'platform_name',60)]);
    }
}
