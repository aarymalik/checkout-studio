-- TRUNCATE bypasses row-level triggers, so it needs a statement-level one.
--
-- This protects the audit log and revision history from application bugs and
-- careless sessions. It does not protect against a determined superuser, who
-- can disable triggers — that is what backups and access control are for.

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_is_append_only();

CREATE TRIGGER revision_no_truncate
  BEFORE TRUNCATE ON "Revision"
  FOR EACH STATEMENT EXECUTE FUNCTION revision_is_immutable();
