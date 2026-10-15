'use strict';

// PostgreSQL registra a alteração na mesma transação da operação financeira.
// Não atribui automaticamente ao cliente operações geradas pelo sistema.
async function installFinanceAudit(pool) {
  await pool.query(`
    CREATE OR REPLACE FUNCTION rota_audit_finance_change()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      before_data jsonb;
      after_data jsonb;
      item jsonb;
      owner_id bigint;
      description text;
      item_label text;
    BEGIN
      IF TG_OP <> 'INSERT' THEN before_data := to_jsonb(OLD); END IF;
      IF TG_OP <> 'DELETE' THEN after_data := to_jsonb(NEW); END IF;
      IF TG_OP = 'UPDATE' AND before_data = after_data THEN RETURN NEW; END IF;
      item := COALESCE(after_data, before_data);
      owner_id := (item->>'user_id')::bigint;
      -- Uma exclusão em cascata da conta não deve recriar seu histórico.
      IF NOT EXISTS (SELECT 1 FROM users WHERE id = owner_id) THEN
        RETURN NULL;
      END IF;
      IF TG_TABLE_NAME = 'rest_days' THEN
        item_label := 'Descanso';
        description := CASE TG_OP
          WHEN 'INSERT' THEN 'Dia de descanso cadastrado'
          WHEN 'UPDATE' THEN 'Dia de descanso atualizado'
          ELSE 'Dia de descanso excluído' END;
      ELSE
        item_label := CASE WHEN item->>'type' = 'income' THEN 'Ganho' ELSE 'Despesa' END;
        description := CASE TG_OP
          WHEN 'INSERT' THEN item_label || ' cadastrado'
          WHEN 'DELETE' THEN item_label || ' excluído'
          ELSE item_label || ' atualizado' END;
        IF TG_OP = 'UPDATE' AND before_data->>'paid' IS DISTINCT FROM after_data->>'paid' THEN
          description := CASE
            WHEN after_data->>'paid' = '1' AND item->>'type' = 'income' THEN 'Recebimento confirmado'
            WHEN after_data->>'paid' = '1' THEN 'Pagamento confirmado'
            WHEN item->>'type' = 'income' THEN 'Recebimento desfeito'
            ELSE 'Pagamento desfeito' END;
        END IF;
      END IF;
      INSERT INTO client_change_log
        (user_id, actor_user_id, action, field_name, old_value, new_value, details)
      VALUES (owner_id, NULL, description, item_label,
        (before_data - 'user_id' - 'request_id')::text,
        (after_data - 'user_id' - 'request_id')::text,
        item_label || ' #' || (item->>'id') ||
          CASE WHEN item ? 'name' THEN ' · ' || (item->>'name') ELSE '' END ||
          ' · R$ ' || (item->>'amount') ||
          ' · ' || COALESCE(item->>'due_date', item->>'rest_date'));
      RETURN NULL;
    END;
    $$;
    DROP TRIGGER IF EXISTS rota_finance_entries_audit ON finance_entries;
    CREATE TRIGGER rota_finance_entries_audit
      AFTER INSERT OR UPDATE OR DELETE ON finance_entries
      FOR EACH ROW EXECUTE FUNCTION rota_audit_finance_change();
    DROP TRIGGER IF EXISTS rota_rest_days_audit ON rest_days;
    CREATE TRIGGER rota_rest_days_audit
      AFTER INSERT OR UPDATE OR DELETE ON rest_days
      FOR EACH ROW EXECUTE FUNCTION rota_audit_finance_change();
  `);
}

module.exports = { installFinanceAudit };
