ALTER TABLE diagram_nodes
    ADD COLUMN node_width DECIMAL(6,2) NULL AFTER position_y,
    ADD CONSTRAINT chk_diagram_node_width CHECK (node_width IS NULL OR (node_width >= 100 AND node_width <= 600));
