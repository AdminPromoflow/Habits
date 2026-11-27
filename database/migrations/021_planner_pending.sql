ALTER TABLE habits
 MODIFY recurrence ENUM('once','daily','weekly','monthly','yearly','pending') NOT NULL DEFAULT 'weekly',
 MODIFY start_date DATE NULL;
ALTER TABLE calendar_tasks
 MODIFY recurrence ENUM('once','daily','weekly','monthly','yearly','pending') NOT NULL DEFAULT 'once',
 MODIFY start_date DATE NULL;
