-- Empty ideas are valid, while diagram titles remain required.
-- The two supported database engines use different CHECK removal syntax.
SET @empty_diagram_nodes_sql = IF(
    EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'diagram_nodes'
        AND CONSTRAINT_NAME = 'chk_diagram_node_text' AND CONSTRAINT_TYPE = 'CHECK'),
    IF(VERSION() LIKE '%MariaDB%',
        'ALTER TABLE diagram_nodes DROP CONSTRAINT chk_diagram_node_text',
        'ALTER TABLE diagram_nodes DROP CHECK chk_diagram_node_text'),
    'SELECT 1'
);
PREPARE empty_diagram_nodes_stmt FROM @empty_diagram_nodes_sql;
EXECUTE empty_diagram_nodes_stmt;
DEALLOCATE PREPARE empty_diagram_nodes_stmt;
