import type { BetterAuthClientPlugin } from "better-auth/client";
import type { privacyKit } from "./index.js";

export const privacyKitClient = () =>
  ({
    id: "privacy-kit",
    $InferServerPlugin: {} as ReturnType<typeof privacyKit>,
  }) satisfies BetterAuthClientPlugin;
