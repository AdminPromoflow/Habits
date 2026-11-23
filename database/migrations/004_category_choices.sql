CREATE TABLE IF NOT EXISTS user_categories (
 user_id BIGINT UNSIGNED NOT NULL,
 category_id BIGINT UNSIGNED NOT NULL,
 joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,category_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(category_id) REFERENCES habit_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO user_categories(user_id,category_id)
SELECT DISTINCT h.owner_user_id,h.category_id FROM habits h
JOIN habit_categories c ON c.id=h.category_id WHERE c.owner_user_id IS NULL;
INSERT IGNORE INTO user_categories(user_id,category_id)
SELECT DISTINCT r.owner_user_id,r.category_id FROM routines r
JOIN habit_categories c ON c.id=r.category_id WHERE c.owner_user_id IS NULL;
