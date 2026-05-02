ALTER TABLE messages ADD COLUMN subagent_session_id TEXT;
CREATE INDEX idx_msg_subagent_session ON messages(conv_id, subagent_session_id);
