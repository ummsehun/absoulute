import fs from "node:fs";
import path from "node:path";

export interface LoadDotEnvOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fileName?: string;
}

export function loadDotEnvFile(options: LoadDotEnvOptions = {}): void {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const fileName = options.fileName ?? ".env";
  const envPath = path.resolve(cwd, fileName);

  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotEnvLine(line);
    if (!parsed || env[parsed.key] !== undefined) {
      continue;
    }
    env[parsed.key] = parsed.value;
  }
}

function parseDotEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  const value = trimmed.slice(separatorIndex + 1).trim();
  return {
    key,
    value: unwrapDotEnvValue(value),
  };
}

function unwrapDotEnvValue(value: string): string {
  if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, "\"");
  }

  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}
