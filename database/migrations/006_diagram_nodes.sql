CREATE TABLE diagram_nodes (
    diagram_id BIGINT UNSIGNED NOT NULL,
    node_key VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    parent_key VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    text VARCHAR(120) NOT NULL,
    sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    layout_mode VARCHAR(16) NULL,
    layout_direction VARCHAR(16) NULL,
    layout_vertical VARCHAR(16) NULL,
    layout_horizontal VARCHAR(8) NULL,
    position_x DECIMAL(12,2) NULL,
    position_y DECIMAL(12,2) NULL,
    PRIMARY KEY (diagram_id, node_key),
    KEY ix_diagram_nodes_parent (diagram_id, parent_key),
    CONSTRAINT fk_diagram_nodes_diagram FOREIGN KEY (diagram_id) REFERENCES diagrams(id) ON DELETE CASCADE,
    CONSTRAINT fk_diagram_nodes_parent FOREIGN KEY (diagram_id, parent_key) REFERENCES diagram_nodes(diagram_id, node_key),
    CONSTRAINT chk_diagram_node_text CHECK (CHAR_LENGTH(TRIM(text)) > 0),
    CONSTRAINT chk_diagram_node_layout CHECK (layout_mode IS NULL OR layout_mode IN ('free','horizontal','vertical','list','topdown','linear','radial','matrix')),
    CONSTRAINT chk_diagram_node_direction CHECK (layout_direction IS NULL OR layout_direction IN ('auto','clockwise','left','right','top','bottom','manual')),
    CONSTRAINT chk_diagram_node_vertical CHECK (layout_vertical IS NULL OR layout_vertical IN ('auto','compact','alternating','top','bottom')),
    CONSTRAINT chk_diagram_node_horizontal CHECK (layout_horizontal IS NULL OR layout_horizontal IN ('auto','ltr','rtl'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO diagram_nodes (diagram_id,node_key,parent_key,text,sort_order)
SELECT id,'root',NULL,name,0 FROM diagrams;
