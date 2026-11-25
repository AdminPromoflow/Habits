ALTER TABLE habit_categories
 ADD COLUMN source_mindspace_id BIGINT UNSIGNED NULL,
 ADD COLUMN source_folder_id BIGINT UNSIGNED NULL,
 ADD UNIQUE KEY uq_category_mindspace (source_mindspace_id),
 ADD UNIQUE KEY uq_category_folder (source_folder_id),
 ADD CONSTRAINT category_mindspace_fk FOREIGN KEY (source_mindspace_id) REFERENCES mindspaces(id) ON DELETE SET NULL,
 ADD CONSTRAINT category_folder_fk FOREIGN KEY (source_folder_id) REFERENCES mindspace_items(id) ON DELETE SET NULL;

ALTER TABLE calendar_tasks
 ADD COLUMN category_id BIGINT UNSIGNED NULL,
 ADD KEY ix_task_category (category_id),
 ADD CONSTRAINT task_category_fk FOREIGN KEY (category_id) REFERENCES habit_categories(id) ON DELETE SET NULL;
