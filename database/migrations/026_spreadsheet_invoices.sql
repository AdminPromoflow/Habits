CREATE TABLE spreadsheet_invoices (
    item_id BIGINT UNSIGNED NOT NULL,
    cell_key VARCHAR(4) NOT NULL,
    image_data MEDIUMTEXT NOT NULL,
    PRIMARY KEY (item_id, cell_key),
    CONSTRAINT fk_spreadsheet_invoice_item FOREIGN KEY (item_id) REFERENCES mindspace_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
