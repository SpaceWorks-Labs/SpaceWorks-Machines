// Full local provisioning followed by the shared web/worker/beat supervisor.
import { spawn } from "node:child_process";
import { localServices, supervise } from "./dev-stack.mjs";

if (process.argv.includes("--help")) {
  console.log("Usage: npm run dev:local\nLoads .env, checks loopback targets, starts Docker services, generates Prisma, applies local migrations, and runs web + BullMQ worker + beat. Ctrl+C stops all three app processes. Docker services remain available.");
  process.exit(0);
}

let setupChild;
let interrupted = false;
function stopSetup() {
  interrupted = true;
  if (!setupChild?.pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(setupChild.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    killer.once("error", () => setupChild?.kill("SIGTERM"));
  } else setupChild.kill("SIGTERM");
}
function run(command, args) {
  if (interrupted) return Promise.reject(new Error("Local startup interrupted."));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env, windowsHide: true });
    setupChild = child;
    child.once("error", reject);
    child.once("exit", code => {
      setupChild = undefined;
      if (code === 0 && !interrupted) resolve();
      else reject(new Error(`${command} failed (${code}).`));
    });
  });
}

try {
  // Validate every target before provisioning, migrations or any worker can start.
  const services = localServices();
  process.once("SIGINT", stopSetup);
  process.once("SIGTERM", stopSetup);
  await run("docker", ["compose", "-f", "docker-compose.yml", "up", "-d", "--wait"]);
  await run(process.execPath, ["scripts/prisma.mjs", "generate"]);
  await run(process.execPath, ["scripts/prisma.mjs", "migrate", "deploy"]);
  await run(process.execPath, ["scripts/build-jobs.mjs"]);
  process.removeListener("SIGINT", stopSetup);
  process.removeListener("SIGTERM", stopSetup);
  console.log("Local services ready. Starting web, worker and beat; Mailpit: http://127.0.0.1:8025");
  process.exitCode = await supervise(services);
} catch (error) {
  process.removeListener("SIGINT", stopSetup);
  process.removeListener("SIGTERM", stopSetup);
  if (!interrupted) console.error(error instanceof Error ? error.message : "Local startup failed.");
  process.exitCode = interrupted ? 130 : 1;
}
