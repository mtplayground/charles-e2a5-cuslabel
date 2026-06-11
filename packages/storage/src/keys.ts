import { readObjectStorageConfig, type ObjectStorageConfig } from "./config.js";

export function toObjectStorageKey(
  relativeKey: string,
  config: ObjectStorageConfig = readObjectStorageConfig()
): string {
  if (!relativeKey) {
    throw new Error("Object storage relative key must not be empty.");
  }

  if (relativeKey.startsWith("/")) {
    throw new Error("Object storage relative key must not start with '/'.");
  }

  if (relativeKey.startsWith(config.prefix)) {
    throw new Error(
      "Object storage key must be relative to the configured prefix."
    );
  }

  return `${config.prefix}${relativeKey}`;
}
