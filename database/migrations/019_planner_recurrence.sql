ALTER TABLE habits ADD COLUMN recurrence_rule TEXT NULL,
 ADD COLUMN source_diagram_id BIGINT UNSIGNED NULL,
 ADD COLUMN source_node_key VARCHAR(64) NULL,
 ADD CONSTRAINT habits_source_diagram_fk FOREIGN KEY(source_diagram_id) REFERENCES diagrams(id) ON DELETE SET NULL;
ALTER TABLE calendar_tasks ADD COLUMN recurrence_rule TEXT NULL,
 ADD COLUMN source_diagram_id BIGINT UNSIGNED NULL,
 ADD COLUMN source_node_key VARCHAR(64) NULL,
 ADD CONSTRAINT tasks_source_diagram_fk FOREIGN KEY(source_diagram_id) REFERENCES diagrams(id) ON DELETE SET NULL;
