import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  DISK_SCAN_HELPER_LABEL,
  DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
  HELPER_TEAM_ID_ENV,
} from "../src/main/services/helper/helperRegistration";

const rawArgs = process.argv.slice(2);
const projectRoot = resolveOptionalArg(rawArgs, "--project-root") ?? process.cwd();
const appPath = resolveOptionalArg(rawArgs, "--app-path")
  ?? join(projectRoot, "release", "mac-arm64", "DiskVisualizer.app");
const expectedTeamId = process.env[HELPER_TEAM_ID_ENV]?.trim();

const targets = [
  {
    name: "app",
    path: appPath,
    requireTeamId: true,
  },
  {
    name: "privileged-helper",
    path: join(
      appPath,
      "Contents",
      "MacOS",
      DISK_SCAN_HELPER_LABEL,
    ),
    requireTeamId: true,
  },
  {
    name: "service-management-probe",
    path: join(
      appPath,
      "Contents",
      "Resources",
      "bin",
      "service-management-probe-macos",
    ),
    requireTeamId: false,
  },
];

const failures: string[] = [];

if (!existsSync(appPath)) {
  failures.push(`app-missing:${appPath}`);
} else {
  const bundleId = await readBundleIdentifier(appPath);
  if (bundleId !== DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER) {
    failures.push(
      `app-bundle-id-mismatch:expected=${DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER}:actual=${bundleId ?? "missing"}`,
    );
  }
}

for (const target of targets) {
  if (!existsSync(target.path)) {
    failures.push(`${target.name}-missing:${target.path}`);
    continue;
  }

  const verify = run("codesign", [
    "--verify",
    "--strict",
    "--verbose=4",
    target.path,
  ]);
  if (verify.status !== 0) {
    failures.push(`${target.name}-codesign-invalid:${formatCommandOutput(verify)}`);
    continue;
  }

  if (target.requireTeamId && expectedTeamId) {
    const details = run("codesign", ["-dv", "--verbose=4", target.path]);
    const teamId = details.output.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim();
    if (teamId !== expectedTeamId) {
      failures.push(
        `${target.name}-team-id-mismatch:expected=${expectedTeamId}:actual=${teamId ?? "missing"}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({
    event: "mac_codesign_verification_failed",
    appPath,
    failures,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  event: "mac_codesign_verification_passed",
  appPath,
}, null, 2));

async function readBundleIdentifier(path: string): Promise<string | null> {
  const result = run("plutil", [
    "-extract",
    "CFBundleIdentifier",
    "raw",
    join(path, "Contents", "Info.plist"),
  ]);

  return result.status === 0 ? result.output.trim() : null;
}

function run(command: string, args: string[]): {
  output: string;
  status: number;
} {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
  });

  return {
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    status: result.status ?? 1,
  };
}

function formatCommandOutput(result: { output: string }): string {
  return result.output.trim().replace(/\s+/g, " ").slice(0, 500);
}

function resolveOptionalArg(
  rawArgs: string[],
  name: string,
): string | undefined {
  const index = rawArgs.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  const value = rawArgs[index + 1]?.trim();
  if (!value || value.startsWith("--")) {
    throw new Error(`missing value for ${name}`);
  }

  return value;
}
