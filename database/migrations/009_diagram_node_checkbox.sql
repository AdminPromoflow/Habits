ALTER TABLE diagram_nodes
    ADD COLUMN checkbox_state TINYINT NULL,
    ADD CONSTRAINT chk_diagram_node_checkbox CHECK (checkbox_state IS NULL OR checkbox_state IN (0,1));
