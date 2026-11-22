<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require __DIR__.'/../app/bootstrap.php';
$db=database();
$path=$argv[1]??__DIR__.'/../storage/hostinger-mi-rutina.sql';
$tables=array_column($db->all('SHOW TABLES'),array_key_first($db->all('SHOW TABLES')[0]));
$sql="-- MI RUTINA 3.0: import only into a NEW, EMPTY database.\n-- Contains private account data. Do not commit or place in public_html.\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n";
$db->transaction(function() use($db,$tables,&$sql) {
    foreach($tables as $table) {
        if(!preg_match('/^[a-z_]+$/D',$table)) throw new RuntimeException('Unexpected table name.');
        $ddl=$db->one("SHOW CREATE TABLE `$table`");
        $sql.="\n".$ddl['Create Table'].";\n";
        if($table==='rate_limits')continue;
        $fields=array_values(array_filter($db->all("SHOW COLUMNS FROM `$table`"),fn($c)=>!str_contains($c['Extra'],'GENERATED')));
        $columns=array_column($fields,'Field');
        $quoted=implode(',',array_map(fn($c)=>'`'.$c.'`',$columns));
        foreach($db->all("SELECT $quoted FROM `$table`") as $row) {
            $values=array_map(fn($v)=>$v===null?'NULL':$db->pdo->quote((string)$v),array_values($row));
            $sql.="INSERT INTO `$table` ($quoted) VALUES (".implode(',',$values).");\n";
        }
    }
});
$sql.="\nSET FOREIGN_KEY_CHECKS=1;\n";
file_put_contents($path,$sql);chmod($path,0600);
echo "Private database export written (".strlen($sql)." bytes).\n";
