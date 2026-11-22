CREATE TABLE IF NOT EXISTS habit_shares (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 owner_user_id BIGINT UNSIGNED NOT NULL,
 recipient_user_id BIGINT UNSIGNED NOT NULL,
 habit_id BIGINT UNSIGNED NULL,
 category_id BIGINT UNSIGNED NULL,
 permission ENUM('viewer','participant','editor') NOT NULL DEFAULT 'viewer',
 progress_visibility ENUM('none','summary','detailed') NOT NULL DEFAULT 'none',
 include_future TINYINT(1) NOT NULL DEFAULT 0,
 status ENUM('pending','accepted','declined','revoked') NOT NULL DEFAULT 'pending',
 invitation_message TEXT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 responded_at TIMESTAMP NULL,
 active_resource VARCHAR(50) GENERATED ALWAYS AS
  (CASE WHEN status IN ('pending','accepted') THEN CONCAT(IF(habit_id IS NULL,'c','h'),COALESCE(habit_id,category_id)) ELSE NULL END) STORED,
 UNIQUE KEY active_invitation(owner_user_id,recipient_user_id,active_resource),
 FOREIGN KEY(owner_user_id) REFERENCES users(id),
 FOREIGN KEY(recipient_user_id) REFERENCES users(id),
 FOREIGN KEY(habit_id) REFERENCES habits(id),
 FOREIGN KEY(category_id) REFERENCES habit_categories(id),
 CHECK((habit_id IS NULL) <> (category_id IS NULL)),
 CHECK(owner_user_id <> recipient_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS share_habits (
 share_id BIGINT UNSIGNED NOT NULL,
 habit_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(share_id,habit_id),
 FOREIGN KEY(share_id) REFERENCES habit_shares(id) ON DELETE CASCADE,
 FOREIGN KEY(habit_id) REFERENCES habits(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS habit_collaborators (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 habit_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 share_id BIGINT UNSIGNED NOT NULL,
 joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 progress_consent ENUM('none','summary','detailed') NOT NULL DEFAULT 'none',
 UNIQUE(habit_id,user_id),
 FOREIGN KEY(habit_id) REFERENCES habits(id),
 FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(share_id) REFERENCES habit_shares(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS collaboration_activity (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 habit_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 action VARCHAR(100) NOT NULL,
 description TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(habit_id) REFERENCES habits(id),
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS invitation_receipts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 owner_user_id BIGINT UNSIGNED NOT NULL,
 share_id BIGINT UNSIGNED NULL,
 recipient_email VARCHAR(190) NOT NULL,
 habit_id BIGINT UNSIGNED NULL,
 category_id BIGINT UNSIGNED NULL,
 permission ENUM('viewer','participant','editor') NOT NULL,
 progress_visibility ENUM('none','summary','detailed') NOT NULL,
 include_future TINYINT(1) NOT NULL DEFAULT 0,
 status ENUM('pending','accepted','declined','revoked') NOT NULL DEFAULT 'pending',
 invitation_message TEXT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 active_resource VARCHAR(50) GENERATED ALWAYS AS
  (CASE WHEN status IN ('pending','accepted') THEN CONCAT(IF(habit_id IS NULL,'c','h'),COALESCE(habit_id,category_id)) ELSE NULL END) STORED,
 UNIQUE(owner_user_id,recipient_email,active_resource),
 FOREIGN KEY(owner_user_id) REFERENCES users(id),
 FOREIGN KEY(share_id) REFERENCES habit_shares(id),
 FOREIGN KEY(habit_id) REFERENCES habits(id),
 FOREIGN KEY(category_id) REFERENCES habit_categories(id),
 CHECK((habit_id IS NULL) <> (category_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
