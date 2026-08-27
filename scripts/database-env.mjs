import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

function hasDatabaseUrl() {
  return Boolean(
    process.env.FAMILY_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim(),
  );
}

// Railway supplies environment variables directly. For a local command, load
// only enough of Next's development environment to reach the compose database.
if (!hasDatabaseUrl()) {
  for (const file of [".env.development.local", ".env.development", ".env.local"]) {
    if (!existsSync(file)) continue;
    loadEnvFile(file);
    if (hasDatabaseUrl()) break;
  }
}

export function requiredDatabaseUrl() {
  const value = process.env.FAMILY_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!value?.trim()) {
    throw new Error(
      "FAMILY_DATABASE_URL eller DATABASE_URL måste vara satt för databaskommandot.",
    );
  }
  return value.trim();
}
