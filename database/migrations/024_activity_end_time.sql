ALTER TABLE habits ADD COLUMN end_time TIME NULL AFTER scheduled_time;
ALTER TABLE calendar_tasks ADD COLUMN end_time TIME NULL AFTER scheduled_time;
