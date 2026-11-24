ALTER TABLE mindspace_items
    ADD COLUMN parent_id BIGINT UNSIGNED NULL AFTER mindspace_id,
    ADD KEY ix_mindspace_folder (mindspace_id,parent_id,sort_order),
    ADD CONSTRAINT fk_mindspace_item_parent FOREIGN KEY (parent_id) REFERENCES mindspace_items(id),
    DROP CONSTRAINT chk_mindspace_item_kind,
    ADD CONSTRAINT chk_mindspace_item_kind CHECK (kind IN ('folder','diagram','spreadsheet','kanban','scrum','habits','notes'));
