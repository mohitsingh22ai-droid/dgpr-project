import { db, unwrap } from "@/lib/supabase/server";

/** Admin audit trail (public.admin_audit_logs). */

export interface AdminAuditEntry {
  id: string;
  admin_id: string;
  admin_email: string;
  action:
    | "pipeline_stage_change"
    | "production_file_download"
    | "user_role_change"
    | "user_status_change"
    | "product_template_edit"
    | "order_archive";
  target_type: "order" | "user" | "product";
  target_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export async function logAdminAction(
  admin_id: string,
  admin_email: string,
  action: AdminAuditEntry["action"],
  target_type: AdminAuditEntry["target_type"],
  target_id: string,
  details: Record<string, unknown> = {}
): Promise<AdminAuditEntry> {
  const row = unwrap(
    await db()
      .from("admin_audit_logs")
      .insert({ admin_id, admin_email, action, target_type, target_id, details })
      .select("*")
      .single(),
    "Write audit log"
  );
  return row as AdminAuditEntry;
}

export async function getAuditLogs(options?: {
  target_type?: string;
  target_id?: string;
  action?: string;
  limit?: number;
}): Promise<AdminAuditEntry[]> {
  let query = db().from("admin_audit_logs").select("*").order("created_at", { ascending: false });
  if (options?.target_type) query = query.eq("target_type", options.target_type);
  if (options?.target_id) query = query.eq("target_id", options.target_id);
  if (options?.action) query = query.eq("action", options.action);
  query = query.limit(Math.min(options?.limit ?? 200, 1000));
  const rows = unwrap(await query, "Load audit logs");
  return rows as AdminAuditEntry[];
}
