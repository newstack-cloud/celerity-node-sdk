import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const LOCALSTACK_ENDPOINT = "http://localhost:4566";
const LOCALSTACK_CREDENTIALS = { accessKeyId: "test", secretAccessKey: "test" };
const LOCALSTACK_REGION = "us-east-1";

const TEST_BUCKET = "test-bucket";
const COPY_DEST_BUCKET = "copy-dest-bucket";

function createClient(): S3Client {
  return new S3Client({
    endpoint: LOCALSTACK_ENDPOINT,
    region: LOCALSTACK_REGION,
    credentials: LOCALSTACK_CREDENTIALS,
    forcePathStyle: true,
  });
}

export async function setup() {
  const client = createClient();

  await createBucket(client, TEST_BUCKET);
  await createBucket(client, COPY_DEST_BUCKET);

  await client.send(
    new PutObjectCommand({
      Bucket: TEST_BUCKET,
      Key: "hello.txt",
      Body: "Hello, World!",
      ContentType: "text/plain",
      Metadata: { author: "test", version: "1" },
    }),
  );

  // 15 objects for list pagination testing
  for (let i = 0; i < 15; i++) {
    await client.send(
      new PutObjectCommand({
        Bucket: TEST_BUCKET,
        Key: `list-test/item-${String(i).padStart(3, "0")}.txt`,
        Body: `Item ${i}`,
        ContentType: "text/plain",
      }),
    );
  }

  // Binary object for range read testing
  await client.send(
    new PutObjectCommand({
      Bucket: TEST_BUCKET,
      Key: "range-test.bin",
      Body: Buffer.alloc(1024, 0xab),
      ContentType: "application/octet-stream",
    }),
  );

  client.destroy();
}

export async function teardown() {
  const client = createClient();

  await emptyAndDeleteBucket(client, TEST_BUCKET);
  await emptyAndDeleteBucket(client, COPY_DEST_BUCKET);

  client.destroy();
}

async function createBucket(client: S3Client, bucket: string) {
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch {
    // Bucket may already exist from a previous run
  }
}

async function emptyAndDeleteBucket(client: S3Client, bucket: string) {
  try {
    let continuationToken: string | undefined;
    do {
      const list = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
      );
      for (const obj of list.Contents ?? []) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
      }
      continuationToken = list.NextContinuationToken;
    } while (continuationToken);

    await client.send(new DeleteBucketCommand({ Bucket: bucket }));
  } catch {
    // Ignore cleanup errors
  }
}
