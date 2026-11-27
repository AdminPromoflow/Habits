ALTER TABLE calendar_tasks
 ADD COLUMN source_item_id BIGINT UNSIGNED NULL,
 ADD COLUMN source_card_key VARCHAR(36) NULL,
 ADD CONSTRAINT tasks_source_item_fk FOREIGN KEY(source_item_id) REFERENCES mindspace_items(id) ON DELETE SET NULL;

ALTER TABLE habits
 ADD COLUMN source_item_id BIGINT UNSIGNED NULL,
 ADD COLUMN source_card_key VARCHAR(36) NULL,
 ADD CONSTRAINT habits_source_item_fk FOREIGN KEY(source_item_id) REFERENCES mindspace_items(id) ON DELETE SET NULL;
