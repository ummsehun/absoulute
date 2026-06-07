import fs from "node:fs";
import path from "node:path";

export function resolveAuditOutputPath(argv: string[]): string | null {
  const outputIndex = argv.indexOf("--out");
  if (outputIndex < 0) {
    return null;
  }

  const outputPath = argv[outputIndex + 1]?.trim();
  if (!outputPath) {
    throw new Error("--out requires an output file path");
  }

  return outputPath;
}

export function writeAuditOutputFile(
  outputPath: string | null,
  json: string,
): void {
  if (!outputPath) {
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${json}\n`, "utf8");
}
