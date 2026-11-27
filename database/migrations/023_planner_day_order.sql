CREATE TABLE calendar_day_orders (
 user_id BIGINT UNSIGNED NOT NULL,
 planned_on DATE NOT NULL,
 entry_order LONGTEXT NOT NULL,
 PRIMARY KEY(user_id,planned_on),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
