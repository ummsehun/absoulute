/* @vitest-environment node */

import { EventEmitter } from "node:events";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const { accessMock, spawnMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    access: accessMock,
  },
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import { requestElevation } from "../../src/main/services/security/macosPrivilegeHelper";

describe("macosPrivilegeHelper", () => {
  afterEach(() => {
    accessMock.mockReset();
    spawnMock.mockReset();
  });

  it("returns granted without opening settings when the path is already readable", async () => {
    accessMock.mockResolvedValue(undefined);

    const result = await requestElevation("/Users/tester/Documents");

    expect(result).toEqual({ granted: true });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("opens Full Disk Access settings for unreadable privacy-protected paths", async () => {
    accessMock.mockRejectedValue(Object.assign(new Error("denied"), { code: "EACCES" }));
    spawnMock.mockImplementation(() => createMockChild(0));
    const protectedPath = `${os.homedir()}/Library/Messages`;

    const result = await requestElevation(protectedPath);

    expect(result).toEqual({ granted: false });
    expect(spawnMock).toHaveBeenCalledWith(
      "open",
      [expect.stringContaining("Privacy_AllFiles")],
      expect.objectContaining({
        stdio: ["ignore", "ignore", "pipe"],
      }),
    );
  });
});

function createMockChild(exitCode: number) {
  const child = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
  };
  child.stderr = new EventEmitter() as EventEmitter & {
    setEncoding: ReturnType<typeof vi.fn>;
  };
  child.stderr.setEncoding = vi.fn();
  queueMicrotask(() => {
    child.emit("close", exitCode);
  });
  return child;
}
