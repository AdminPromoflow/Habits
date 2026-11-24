ALTER TABLE diagram_nodes
    ADD COLUMN image_data MEDIUMTEXT NULL,
    ADD COLUMN labels_json TEXT NULL;
