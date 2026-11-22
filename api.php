<?php
declare(strict_types=1);
require __DIR__.'/app/bootstrap.php';
securityHeaders();
header('Content-Type: application/json; charset=utf-8');
beginSession();
try {
    $db=database(); $auth=new Auth($db); $method=$_SERVER['REQUEST_METHOD'];
    if (!in_array($method,['GET','POST'],true)) fail('error_method',405);
    $action=$_GET['action']??'bootstrap';
    if (!is_string($action)) fail('error_validation');
    $d=[];
    if ($method==='POST') {
        if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE']??''),'application/json')) fail('error_validation',415);
        if (!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) fail('error_csrf',419);
        if ((int)($_SERVER['CONTENT_LENGTH']??0)>100000) fail('error_validation',413);
        $raw=file_get_contents('php://input',false,null,0,100001);
        if (strlen($raw)>100000) fail('error_validation',413);
        $d=json_decode($raw,true,32,JSON_THROW_ON_ERROR);
        if (!is_array($d)) fail('error_validation');
    }
    $public=['login','register','setup','forgotPassword','resetPassword','logout','language'];
    if ($action==='bootstrap' && $method==='GET') {
        $user=$auth->user(); $lang=$user['language']??($_COOKIE['rutina_language']??'en'); if (!in_array($lang,['en','es'],true)) $lang='en';
        $result=['user'=>$user,'language'=>$lang,'translations'=>['en'=>require __DIR__.'/translations/en.php','es'=>require __DIR__.'/translations/es.php'],
          'csrf'=>$_SESSION['csrf'],'registration_enabled'=>($db->one("SELECT setting_value FROM platform_settings WHERE setting_key='registration_enabled'")['setting_value']??'1')==='1',
          'platform_name'=>$db->one("SELECT setting_value FROM platform_settings WHERE setting_key='platform_name'")['setting_value']??'MI RUTINA'];
        if ($user) $result['data']=(new Habits($db,$user))->data();
    } elseif (in_array($action,$public,true)) {
        if ($method!=='POST') fail('error_method',405);
        if ($action==='language') {
            $lang=Validate::choice($d['language']??'',['en','es']); $user=$auth->user();
            if ($user) (new Habits($db,$user))->settings(['language'=>$lang]); else languageCookie($lang);
        } elseif ($action==='logout') $auth->logout();
        else $auth->$action($d);
        $result=['csrf'=>$_SESSION['csrf']];
    } else {
        $user=$auth->requireUser(); $service=new Habits($db,$user);
        if ($method==='GET') {
            $result=match($action) {
                'data'=>$service->data(),
                'group'=>$service->group($_GET),
                'admin'=>$service->adminData(),
                'timezones'=>DateTimeZone::listIdentifiers(),
                default=>fail('error_not_found',404)
            };
        } else {
            if ($action==='share') $auth->rate('share:'.$user['id'],20,3600);
            if ($action==='requestCategory') $auth->rate('request:'.$user['id'],10,3600);
            if ($action==='password') $auth->rate('password:'.$user['id'],8,3600);
            $result=$db->transaction(function() use($action,$service,$d,$db,$user) {
                return match($action) {
                    'saveHabit'=>['id'=>$service->saveHabit($d)],
                    'archiveHabit'=>$service->archiveHabit($d),
                    'complete'=>$service->complete($d),
                    'saveCategory'=>['id'=>$service->saveCategory($d)],
                    'deleteCategory'=>$service->deleteCategory($d),
                    'saveRoutine'=>['id'=>$service->saveRoutine($d)],
                    'requestCategory'=>$service->requestCategory($d),
                    'reviewCategory'=>$service->reviewCategory($d),
                    'share'=>$service->share($d),
                    'respond'=>$service->respond($d),
                    'changeShare'=>$service->changeShare($d),
                    'leaveShare'=>$service->leaveShare($d),
                    'consent'=>$service->consent($d),
                    'settings'=>$service->settings($d),
                    'password'=>$service->password($d),
                    'weight'=>$service->weight($d),
                    'manageUser'=>$service->manageUser($d),
                    'saveGlobalCategory'=>['id'=>$service->saveCategory($d,true)],
                    'deleteGlobalCategory'=>$service->deleteCategory($d,true),
                    'saveTemplate'=>$service->saveTemplate($d),
                    'platform'=>$service->platform($d),
                    'readNotifications'=>$db->run('UPDATE notifications SET is_read=1 WHERE user_id=?',[$user['id']])?null:null,
                    default=>fail('error_not_found',404)
                };
            });
        }
    }
    echo json_encode(['ok'=>true,'result'=>$result],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
} catch (AppError $e) {
    http_response_code($e->status); echo json_encode(['ok'=>false,'error'=>$e->key]);
} catch (JsonException $e) {
    http_response_code(422); echo json_encode(['ok'=>false,'error'=>'error_validation']);
} catch (PDOException $e) {
    $duplicate=$e->getCode()==='23000';
    if (!$duplicate) error_log('MI RUTINA database error: '.$e->getMessage());
    http_response_code($duplicate?409:503); echo json_encode(['ok'=>false,'error'=>$duplicate?'error_duplicate':'error_database']);
} catch (Throwable $e) {
    error_log('MI RUTINA: '.$e); http_response_code(500); echo json_encode(['ok'=>false,'error'=>'error_server']);
}
