/* @vitest-environment node */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadDotEnvFile } from "../../src/main/core/envLoader";
import {
  createDefaultHelperTransport,
  HELPER_PROTOTYPE_ENUMERATE_ENV,
  HELPER_TRANSPORT_ENV,
} from "../../src/main/services/helper/helperClient";

describe("envLoader", () => {
  it("loads .env values without overriding explicit process env", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "diskviz-env-loader-"));
    const env: NodeJS.ProcessEnv = {
      SCAN_HELPER_TRANSPORT: "disabled",
    };

    try {
      fs.writeFileSync(
        path.join(root, ".env"),
        [
          "SCAN_HELPER_TRANSPORT=xpc",
          "SCAN_HELPER_PROTOTYPE_ENUMERATE=true",
          "QUOTED_VALUE=\"hello world\"",
          "SINGLE_QUOTED='literal value'",
        ].join("\n"),
      );

      loadDotEnvFile({ cwd: root, env });

      expect(env.SCAN_HELPER_TRANSPORT).toBe("disabled");
      expect(env.SCAN_HELPER_PROTOTYPE_ENUMERATE).toBe("true");
      expect(env.QUOTED_VALUE).toBe("hello world");
      expect(env.SINGLE_QUOTED).toBe("literal value");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("enables the xpc prototype helper transport from loaded .env values", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "diskviz-env-helper-"));
    const env: NodeJS.ProcessEnv = {};

    try {
      fs.writeFileSync(
        path.join(root, ".env"),
        [
          `${HELPER_TRANSPORT_ENV}=xpc`,
          `${HELPER_PROTOTYPE_ENUMERATE_ENV}=true`,
        ].join("\n"),
      );

      loadDotEnvFile({ cwd: root, env });
      const transport = createDefaultHelperTransport(env, "darwin", null, root);

      expect(transport.constructor.name).toBe("MacOsXpcHelperTransport");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
