CREATE TABLE mindspaces (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_user_id BIGINT UNSIGNED NOT NULL,
    space_key VARCHAR(64) NOT NULL DEFAULT 'home',
    name VARCHAR(120) NOT NULL DEFAULT 'MindSpace',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_mindspace_owner_key (owner_user_id, space_key),
    CONSTRAINT fk_mindspace_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mindspace_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mindspace_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(24) NOT NULL,
    name VARCHAR(120) NOT NULL,
    diagram_id BIGINT UNSIGNED NULL,
    content_json MEDIUMTEXT NOT NULL,
    client_key CHAR(36) NOT NULL,
    sort_order BIGINT UNSIGNED NOT NULL DEFAULT 0,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_mindspace_item_create (mindspace_id, client_key),
    UNIQUE KEY uq_mindspace_diagram (diagram_id),
    KEY ix_mindspace_items_order (mindspace_id, sort_order, id),
    CONSTRAINT fk_mindspace_item_space FOREIGN KEY (mindspace_id) REFERENCES mindspaces(id) ON DELETE CASCADE,
    CONSTRAINT fk_mindspace_item_diagram FOREIGN KEY (diagram_id) REFERENCES diagrams(id) ON DELETE CASCADE,
    CONSTRAINT chk_mindspace_item_kind CHECK (kind IN ('diagram','spreadsheet','kanban','scrum','habits','notes')),
    CONSTRAINT chk_mindspace_item_diagram CHECK ((kind='diagram' AND diagram_id IS NOT NULL) OR (kind<>'diagram' AND diagram_id IS NULL)),
    CONSTRAINT chk_mindspace_item_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
    CONSTRAINT chk_mindspace_item_content CHECK (JSON_VALID(content_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO mindspaces (owner_user_id) SELECT id FROM users;

INSERT INTO mindspace_items (mindspace_id,kind,name,diagram_id,content_json,client_key,sort_order,created_at,updated_at)
SELECT m.id,'diagram',d.name,d.id,'{}',d.client_key,d.id,d.created_at,d.updated_at
FROM diagrams d JOIN mindspaces m ON m.owner_user_id=d.owner_user_id AND m.space_key='home';
