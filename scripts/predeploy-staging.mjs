await import("./migrate.mjs");

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}

await import("./seed-staging.mjs");

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
