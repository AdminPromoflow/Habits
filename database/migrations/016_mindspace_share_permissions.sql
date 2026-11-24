ALTER TABLE mindspace_shares
    ADD COLUMN inviter_user_id BIGINT UNSIGNED NULL AFTER owner_user_id,
    ADD COLUMN parent_share_id BIGINT UNSIGNED NULL AFTER item_id,
    ADD COLUMN can_edit TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN can_move TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN can_delete TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN can_share TINYINT(1) NOT NULL DEFAULT 0;

UPDATE mindspace_shares SET inviter_user_id=owner_user_id;

ALTER TABLE mindspace_shares
    MODIFY inviter_user_id BIGINT UNSIGNED NOT NULL,
    ADD KEY ix_ms_share_owner (owner_user_id),
    DROP INDEX uq_ms_share_space,
    DROP INDEX uq_ms_share_item,
    ADD UNIQUE KEY uq_ms_share_space (inviter_user_id,recipient_email,space_id),
    ADD UNIQUE KEY uq_ms_share_item (inviter_user_id,recipient_email,item_id),
    ADD CONSTRAINT fk_ms_share_inviter FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_ms_share_parent FOREIGN KEY (parent_share_id) REFERENCES mindspace_shares(id) ON DELETE CASCADE,
    ADD CONSTRAINT chk_ms_share_flags CHECK (can_edit IN (0,1) AND can_move IN (0,1) AND can_delete IN (0,1) AND can_share IN (0,1));
