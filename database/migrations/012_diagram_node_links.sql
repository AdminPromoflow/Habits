-- A topic may link to an owned diagram or one of its topics.
-- Targets are validated by the model; replacing a tree must not cascade links.
ALTER TABLE diagram_nodes ADD COLUMN link_json TEXT NULL;
