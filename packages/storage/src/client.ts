import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readObjectStorageConfig, type ObjectStorageConfig } from "./config.js";
import { toObjectStorageKey } from "./keys.js";

let storageClient: S3Client | undefined;

export function createObjectStorageClient(
  config: ObjectStorageConfig = readObjectStorageConfig()
): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

export function getObjectStorageClient(): S3Client {
  storageClient ??= createObjectStorageClient();
  return storageClient;
}

export interface PutObjectInput {
  relativeKey: string;
  body: PutObjectCommandInput["Body"];
  contentLength: number;
  contentType?: string;
}

export async function putObject(
  input: PutObjectInput,
  client = getObjectStorageClient(),
  config = readObjectStorageConfig()
): Promise<string> {
  if (!Number.isFinite(input.contentLength) || input.contentLength < 0) {
    throw new Error("PutObject contentLength must be a concrete byte length.");
  }

  const key = toObjectStorageKey(input.relativeKey, config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: input.body,
      ContentLength: input.contentLength,
      ContentType: input.contentType
    })
  );

  return key;
}

export async function getObject(
  relativeKey: string,
  client = getObjectStorageClient(),
  config = readObjectStorageConfig()
) {
  const key = toObjectStorageKey(relativeKey, config);

  return client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key
    })
  );
}

export async function deleteObject(
  relativeKey: string,
  client = getObjectStorageClient(),
  config = readObjectStorageConfig()
): Promise<void> {
  const key = toObjectStorageKey(relativeKey, config);

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key
    })
  );
}

export async function createPresignedGetUrl(
  relativeKey: string,
  expiresInSeconds = 3600,
  client = getObjectStorageClient(),
  config = readObjectStorageConfig()
): Promise<string> {
  const key = toObjectStorageKey(relativeKey, config);

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key
    }),
    {
      expiresIn: expiresInSeconds
    }
  );
}

export async function checkObjectStorageConnection(
  client = getObjectStorageClient(),
  config = readObjectStorageConfig()
): Promise<void> {
  await client.send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: config.prefix,
      MaxKeys: 1
    })
  );
}
