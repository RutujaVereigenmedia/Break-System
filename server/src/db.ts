import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";

// Load .env from server/ whether launched via tsx (src/) or compiled JS (dist/).
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const databaseUrl = process.env.DATABASE_URL?.trim();
const pgPassword = process.env.PGPASSWORD;

if (databaseUrl) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error(
      "DATABASE_URL is invalid. Expected: postgresql://postgres:YOUR_PASSWORD@localhost:5432/breakflow"
    );
  }

  if (!parsedUrl.password) {
    throw new Error(
      "PostgreSQL password is missing from DATABASE_URL. Edit server/.env and replace YOUR_PASSWORD with your actual PostgreSQL password. If your password contains @, :, /, # or %, URL-encode it or use PGPASSWORD configuration instead."
    );
  }
} else if (!pgPassword) {
  throw new Error(
    [
      "PostgreSQL password is missing.",
      "Create server/.env from server/.env.example and set either:",
      "DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/breakflow",
      "or set PGHOST, PGPORT, PGDATABASE, PGUSER and PGPASSWORD.",
      "Replace YOUR_PASSWORD with the password you use for PostgreSQL."
    ].join("\\n")
  );
}

export const pool = new Pool(
  databaseUrl
    ? { connectionString: databaseUrl }
    : {
        host: process.env.PGHOST?.trim() || "localhost",
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE?.trim() || "breakflow",
        user: process.env.PGUSER?.trim() || "postgres",
        password: pgPassword,
      }
);

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});
