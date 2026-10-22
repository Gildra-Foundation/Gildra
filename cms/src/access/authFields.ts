import type { FieldAccess, SanitizedConfig } from "payload";

/** Numeric IDs in the staff and reader collections are independent identities. */
export function hardenAuthFields(config: SanitizedConfig): SanitizedConfig {
  for (const slug of ["admins", "members"]) {
    const collection = config.collections.find((item) => item.slug === slug);
    if (!collection) continue;
    const sessions = collection.fields.find((field) => "name" in field && field.name === "sessions");
    if (!sessions || sessions.type !== "array") continue;
    const previous = sessions.access?.read;
    const read: FieldAccess = (args) => args.req.user?.collection === slug && (previous ? previous(args) : false);
    // Payload reuses the base auth field object between collections. Clone it
    // rather than making the staff and reader gates wrap each other.
    collection.fields = collection.fields.map((field) => field === sessions ? { ...sessions, access: { ...sessions.access, read } } : field);
    collection.flattenedFields = collection.flattenedFields.map((field) =>
      field.name === "sessions" && field.type === "array" ? { ...field, access: { ...field.access, read } } : field);
  }
  return config;
}
