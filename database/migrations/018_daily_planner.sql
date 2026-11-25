ALTER TABLE habits ADD COLUMN recurrence ENUM('once','daily','weekly','monthly','yearly') NOT NULL DEFAULT 'weekly';
CREATE TABLE calendar_tasks (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 owner_user_id BIGINT UNSIGNED NOT NULL,
 name VARCHAR(190) NOT NULL,
 description TEXT NOT NULL,
 recurrence ENUM('once','daily','weekly','monthly','yearly') NOT NULL DEFAULT 'once',
 schedule_days VARCHAR(30) NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
 scheduled_time TIME NULL,
 start_date DATE NOT NULL,
 end_date DATE NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX owner_date(owner_user_id,start_date),
 FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
 CHECK(end_date IS NULL OR end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE calendar_task_completions (
 task_id BIGINT UNSIGNED NOT NULL,
 completed_on DATE NOT NULL,
 PRIMARY KEY(task_id,completed_on),
 FOREIGN KEY(task_id) REFERENCES calendar_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
