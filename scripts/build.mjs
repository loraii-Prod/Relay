import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx", ["prisma", "generate"]);

if (process.env.DATABASE_URL) {
  console.log("[Relay build] DATABASE_URL detected; applying pending migrations.");
  run("npx", ["prisma", "migrate", "deploy"]);
} else {
  console.log("[Relay build] DATABASE_URL not configured; skipping database migration.");
}

run("npx", ["next", "build"]);
