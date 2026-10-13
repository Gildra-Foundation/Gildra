import type { SanitizedPermissions, TypedUser } from "payload";
import React from "react";

import { asStaff } from "../../access/roles";
import { adminSections } from "../../admin/navModel";
import { AdminNavLinks } from "./AdminNavLinks";

/**
 * Sidebar of the admin (sections in `admin/navModel.ts`). Every collection has
 * `admin.group: false`, so Payload's own grouped list does not repeat them.
 */
export function AdminNav({
  user,
  permissions,
  i18n,
}: {
  user?: TypedUser | null;
  permissions?: SanitizedPermissions;
  i18n?: { language?: string };
}) {
  if (!asStaff(user)) return null;
  return <AdminNavLinks sections={adminSections(user, permissions as never, i18n?.language)} />;
}
