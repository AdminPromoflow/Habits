ALTER TABLE mindspace_items
    DROP CONSTRAINT chk_mindspace_item_kind,
    ADD CONSTRAINT chk_mindspace_item_kind CHECK (kind IN ('folder','diagram','spreadsheet','kanban','scrum','habits','notes','files'));

CREATE TABLE library_entries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    kind VARCHAR(12) NOT NULL,
    name VARCHAR(180) NOT NULL,
    mime VARCHAR(80) NULL,
    size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
    client_key CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_library_entry_item (item_id,id),
    UNIQUE KEY uq_library_entry_key (item_id,client_key),
    KEY ix_library_date (item_id,parent_id,created_at,id),
    CONSTRAINT fk_library_item FOREIGN KEY (item_id) REFERENCES mindspace_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_library_parent FOREIGN KEY (item_id,parent_id) REFERENCES library_entries(item_id,id) ON DELETE CASCADE,
    CONSTRAINT chk_library_kind CHECK (kind IN ('folder','image','pdf')),
    CONSTRAINT chk_library_name CHECK (CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE library_file_chunks (
    entry_id BIGINT UNSIGNED NOT NULL,
    chunk_index INT UNSIGNED NOT NULL,
    bytes MEDIUMBLOB NOT NULL,
    PRIMARY KEY (entry_id,chunk_index),
    CONSTRAINT fk_library_chunk_entry FOREIGN KEY (entry_id) REFERENCES library_entries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
