import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { Admins } from "./collections/Admins";
import { Guides } from "./collections/Guides";
import { Media } from "./collections/Media";
import { Pages } from "./collections/Pages";
import { migrations } from "./migrations";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  serverURL: process.env.PAYLOAD_PUBLIC_URL ?? "http://localhost:3001",
  admin: {
    user: Admins.slug,
    importMap: { baseDir: path.resolve(dirname) },
  },
  collections: [Admins, Media, Pages, Guides],
  localization: {
    locales: ["en", "ru"],
    defaultLocale: "en",
    fallback: true,
  },
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET ?? "",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: postgresAdapter({
    push: process.env.PAYLOAD_DB_PUSH === "true",
    migrationDir: path.resolve(dirname, "migrations"),
    prodMigrations: migrations,
    pool: { connectionString: process.env.PAYLOAD_DATABASE_URL ?? "" },
  }),
  sharp,
});
