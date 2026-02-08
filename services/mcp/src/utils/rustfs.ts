import {
  S3Client,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { S3 } from "../config/constants";
import { logger } from "../logging";
import type { Config } from "../types/tool";

function createS3Client(config: Config): S3Client {
  return new S3Client({
    endpoint: config.RUSTFS_ENDPOINT,
    region: S3.REGION,
    credentials: {
      accessKeyId: config.RUSTFS_ACCESS_KEY,
      secretAccessKey: config.RUSTFS_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

export async function initializeBucket(config: Config): Promise<void> {
  const s3 = createS3Client(config);
  const bucket = config.RUSTFS_BUCKET;

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    logger.info({ event_name: "rustfs.bucket_exists", bucket });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "NotFound") {
      logger.info({ event_name: "rustfs.bucket_creating", bucket });
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } else {
      throw error;
    }
  }

  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };

  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(policy),
    }),
  );

  logger.info({ event_name: "rustfs.bucket_initialized", bucket });
}
