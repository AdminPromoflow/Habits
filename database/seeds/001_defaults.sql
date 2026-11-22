INSERT INTO platform_settings(setting_key,setting_value) VALUES ('registration_enabled','1'),('platform_name','MI RUTINA') ON DUPLICATE KEY UPDATE setting_key=VALUES(setting_key);
INSERT INTO habit_categories(owner_user_id,name,translation_key,description,icon,color) VALUES
(NULL,'Movement','cat_movement','','dumbbell','#CBE8DD'),
(NULL,'Mindfulness','cat_mindfulness','','flower','#B8A4D4'),
(NULL,'Learning','cat_learning','','book','#D4E5F7'),
(NULL,'Self-care','cat_selfcare','','heart','#F5C8D8'),
(NULL,'Nutrition','cat_nutrition','','leaf','#F8D8C5')
ON DUPLICATE KEY UPDATE name=VALUES(name);
INSERT INTO habit_templates(category_id,name,translation_key,description,goal,unit)
SELECT id,'Read 20 pages','template_read','',20,'pages' FROM habit_categories WHERE translation_key='cat_learning' AND NOT EXISTS(SELECT 1 FROM habit_templates WHERE translation_key='template_read');
INSERT INTO habit_templates(category_id,name,translation_key,description,goal,unit)
SELECT id,'A moment of calm','template_calm','',10,'minutes' FROM habit_categories WHERE translation_key='cat_mindfulness' AND NOT EXISTS(SELECT 1 FROM habit_templates WHERE translation_key='template_calm');
INSERT INTO habit_templates(category_id,name,translation_key,description,goal,unit)
SELECT id,'Drink water','template_water','',8,'glasses' FROM habit_categories WHERE translation_key='cat_nutrition' AND NOT EXISTS(SELECT 1 FROM habit_templates WHERE translation_key='template_water');
