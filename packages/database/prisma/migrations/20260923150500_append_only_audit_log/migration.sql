-- The audit log is append-only.
--
-- docs/security.md requires audit entries to be immutable. Application code
-- cannot guarantee that: a bug, a migration, or a console session could rewrite
-- history. A trigger can, and it applies to every role and every connection.

CREATE OR REPLACE FUNCTION audit_log_is_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'AuditLog is append-only: % is not permitted. See docs/security.md.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();

-- Revisions are immutable once written, for the same reason: a published
-- revision must render identically forever, and orders reference the exact
-- revision a customer saw.
CREATE OR REPLACE FUNCTION revision_is_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Revision % is immutable: publishing points a page at a revision, it never edits one. See docs/history-versioning.md.', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER revision_no_update
  BEFORE UPDATE ON "Revision"
  FOR EACH ROW EXECUTE FUNCTION revision_is_immutable();
