DROP TRIGGER IF EXISTS approvals_ownership_trigger ON approvals;
DROP TRIGGER IF EXISTS memory_change_requests_ownership_trigger ON memory_change_requests;
DROP TRIGGER IF EXISTS form_tasks_ownership_trigger ON form_tasks;
DROP FUNCTION IF EXISTS bhashaagent_check_ownership();

ALTER TABLE conversations
  ADD CONSTRAINT conversations_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE profile_memories
  ADD CONSTRAINT profile_memories_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE memory_change_requests
  ADD CONSTRAINT memory_change_requests_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE form_tasks
  ADD CONSTRAINT form_tasks_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE form_tasks
  ADD CONSTRAINT form_tasks_conversation_user_id_fkey
  FOREIGN KEY (conversation_id, user_id)
  REFERENCES conversations (id, user_id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE memory_change_requests
  ADD CONSTRAINT memory_change_requests_existing_memory_user_id_fkey
  FOREIGN KEY (existing_memory_id, user_id)
  REFERENCES profile_memories (id, user_id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE approvals
  ADD CONSTRAINT approvals_conversation_user_id_fkey
  FOREIGN KEY (conversation_id, user_id)
  REFERENCES conversations (id, user_id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE approvals
  ADD CONSTRAINT approvals_form_task_user_id_fkey
  FOREIGN KEY (form_task_id, user_id)
  REFERENCES form_tasks (id, user_id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE approvals
  ADD CONSTRAINT approvals_memory_change_request_user_id_fkey
  FOREIGN KEY (memory_change_request_id, user_id)
  REFERENCES memory_change_requests (id, user_id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
