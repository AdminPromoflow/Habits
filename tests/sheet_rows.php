<?php
require __DIR__.'/../controller/security/bootstrap.php';
$checks = 0;
function expectRow(bool $value, string $message): void { global $checks; if (!$value) throw new RuntimeException($message); $checks++; }
$sheet = ['rows'=>6,'columns'=>5,'cells'=>['A1'=>'Header','A2'=>'two','A3'=>'three','A4'=>'four','B3'=>'=C3*2','C3'=>'5','D1'=>'=SUM(C2:C4)','E1'=>'=A3'], 'cell_styles'=>['A3'=>['bold'=>true],'B2'=>['italic'=>true]], 'invoices'=>['G3'=>['name'=>'receipt']]];
$moved = SpreadsheetRows::move($sheet,3,2);
expectRow($moved['cells']['A2']==='three' && $moved['cells']['A3']==='two' && $moved['cells']['A4']==='four','Insert, not swap, while moving upwards');
expectRow($moved['cells']['B2']==='=C2*2' && $moved['cells']['E1']==='=A2','Formulas follow moved references inside and outside the row');
expectRow($moved['cells']['D1']==='=SUM(C2:C4)','A range containing the whole move stays unchanged');
expectRow($moved['cell_styles']['A2']['bold'] && $moved['cell_styles']['B3']['italic'] && isset($moved['invoices']['G2']),'Styles and attachments follow their rows');
expectRow(SpreadsheetRows::move($moved,2,3)===$sheet,'Reversing an adjacent move restores all data');
$moved = SpreadsheetRows::move($sheet,3,5);
expectRow($moved['cells']['A3']==='four' && $moved['cells']['A5']==='three' && !isset($moved['cells']['A4']),'Moving down shifts intervening rows, including blanks');
expectRow($moved['cells']['D1']==='=SUM(C2:C3,C5:C5)','Noncontiguous ranges retain exactly their original cells');
$formula = ['rows'=>8,'columns'=>3,'cells'=>['C1'=>'=SUM(A2:B3)+1e3+A3+AVERAGE(A2:A4)']];
expectRow(SpreadsheetRows::move($formula,3,6)['cells']['C1']==='=SUM(A2:B2,A6:B6)+1e3+A6+AVERAGE(A2:A3,A6:A6)','Multiple ranges and scientific notation are rewritten safely');
expectRow(SpreadsheetRows::move($sheet,2,2)===$sheet,'A same-position move is a no-op');
foreach ([[0,2],[2,7],[1,2],[2,1]] as [$from,$to]) {
    try { SpreadsheetRows::move($sheet+['template'=>'ledger'],$from,$to); throw new RuntimeException('Invalid move accepted'); }
    catch (AppError $error) { expectRow($error->key==='error_validation','Bounds and template header remain protected'); }
}
echo "$checks row transformation checks passed.\n";
