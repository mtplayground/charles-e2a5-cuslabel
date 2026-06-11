export interface ObjectStorageConfig {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  prefix: string;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
}

type RequiredEnvName =
  | "OBJECT_STORAGE_ACCESS_KEY_ID"
  | "OBJECT_STORAGE_SECRET_ACCESS_KEY"
  | "OBJECT_STORAGE_BUCKET"
  | "OBJECT_STORAGE_PREFIX"
  | "OBJECT_STORAGE_ENDPOINT"
  | "OBJECT_STORAGE_REGION"
  | "OBJECT_STORAGE_FORCE_PATH_STYLE";

function readRequiredEnv(
  env: NodeJS.ProcessEnv,
  name: RequiredEnvName
): string {
  const value = env[name];

  if (!value) {
    throw new Error(`${name} must be set for object storage.`);
  }

  return value;
}

function parseForcePathStyle(value: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error("OBJECT_STORAGE_FORCE_PATH_STYLE must be true or false.");
}

export function readObjectStorageConfig(
  env: NodeJS.ProcessEnv = process.env
): ObjectStorageConfig {
  return {
    accessKeyId: readRequiredEnv(env, "OBJECT_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: readRequiredEnv(env, "OBJECT_STORAGE_SECRET_ACCESS_KEY"),
    bucket: readRequiredEnv(env, "OBJECT_STORAGE_BUCKET"),
    prefix: readRequiredEnv(env, "OBJECT_STORAGE_PREFIX"),
    endpoint: readRequiredEnv(env, "OBJECT_STORAGE_ENDPOINT"),
    region: readRequiredEnv(env, "OBJECT_STORAGE_REGION"),
    forcePathStyle: parseForcePathStyle(
      readRequiredEnv(env, "OBJECT_STORAGE_FORCE_PATH_STYLE")
    )
  };
}

export function requireObjectStorageConfig(): ObjectStorageConfig {
  return readObjectStorageConfig();
}
