CREATE OR REPLACE FUNCTION bhashaagent_check_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'approvals' THEN
    IF NEW.conversation_id IS NOT NULL THEN
      SELECT user_id INTO target_user_id FROM conversations WHERE id = NEW.conversation_id;
      IF target_user_id IS DISTINCT FROM NEW.user_id THEN
        RAISE EXCEPTION 'approval conversation must belong to approval user';
      END IF;
    END IF;

    IF NEW.memory_change_request_id IS NOT NULL THEN
      SELECT user_id INTO target_user_id
      FROM memory_change_requests
      WHERE id = NEW.memory_change_request_id;
      IF target_user_id IS DISTINCT FROM NEW.user_id THEN
        RAISE EXCEPTION 'approval memory change request must belong to approval user';
      END IF;
    END IF;

    IF NEW.form_task_id IS NOT NULL THEN
      SELECT user_id INTO target_user_id FROM form_tasks WHERE id = NEW.form_task_id;
      IF target_user_id IS DISTINCT FROM NEW.user_id THEN
        RAISE EXCEPTION 'approval form task must belong to approval user';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'memory_change_requests' AND NEW.existing_memory_id IS NOT NULL THEN
    SELECT user_id INTO target_user_id
    FROM profile_memories
    WHERE id = NEW.existing_memory_id;
    IF target_user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'memory change request must belong to existing memory user';
    END IF;
  ELSIF TG_TABLE_NAME = 'form_tasks' THEN
    SELECT user_id INTO target_user_id FROM conversations WHERE id = NEW.conversation_id;
    IF target_user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'form task must belong to conversation user';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER approvals_ownership_trigger
  BEFORE INSERT OR UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION bhashaagent_check_ownership();

CREATE TRIGGER memory_change_requests_ownership_trigger
  BEFORE INSERT OR UPDATE ON memory_change_requests
  FOR EACH ROW EXECUTE FUNCTION bhashaagent_check_ownership();

CREATE TRIGGER form_tasks_ownership_trigger
  BEFORE INSERT OR UPDATE ON form_tasks
  FOR EACH ROW EXECUTE FUNCTION bhashaagent_check_ownership();
