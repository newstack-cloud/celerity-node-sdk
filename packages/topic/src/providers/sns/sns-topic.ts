import createDebug from "debug";
import {
  type SNSClient,
  PublishCommand,
  PublishBatchCommand,
  type MessageAttributeValue,
  type PublishBatchRequestEntry,
} from "@aws-sdk/client-sns";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";
import type {
  Topic,
  PublishOptions,
  PublishResult,
  BatchPublishEntry,
  BatchPublishResult,
  BatchPublishSuccess,
  BatchPublishFailure,
} from "../../types";
import { TopicError } from "../../errors";

const debug = createDebug("celerity:topic:sns");

const SNS_MAX_BATCH_SIZE = 10;

export class SNSTopic implements Topic {
  constructor(
    private readonly topicArn: string,
    private readonly client: SNSClient,
    private readonly tracer?: CelerityTracer,
  ) {}

  async publish<T = Record<string, unknown>>(
    body: T,
    options?: PublishOptions,
  ): Promise<PublishResult> {
    debug("publish %s", this.topicArn);
    return this.traced("celerity.topic.publish", { "topic.arn": this.topicArn }, async () => {
      try {
        const result = await this.client.send(
          new PublishCommand({
            TopicArn: this.topicArn,
            Message: JSON.stringify(body),
            MessageGroupId: options?.groupId,
            MessageDeduplicationId: options?.deduplicationId,
            Subject: options?.subject,
            MessageAttributes: options?.attributes
              ? toSNSAttributes(options.attributes)
              : undefined,
          }),
        );
        return { messageId: result.MessageId! };
      } catch (error) {
        throw new TopicError(
          `Failed to publish message to topic "${this.topicArn}"`,
          this.topicArn,
          { cause: error },
        );
      }
    });
  }

  async publishBatch<T = Record<string, unknown>>(
    entries: BatchPublishEntry<T>[],
  ): Promise<BatchPublishResult> {
    debug("publishBatch %s (%d entries)", this.topicArn, entries.length);
    return this.traced(
      "celerity.topic.publish_batch",
      { "topic.arn": this.topicArn, "topic.message_count": entries.length },
      async () => {
        const successful: BatchPublishSuccess[] = [];
        const failed: BatchPublishFailure[] = [];

        // Auto-chunk into groups of 10 (SNS limit)
        for (let i = 0; i < entries.length; i += SNS_MAX_BATCH_SIZE) {
          const chunk = entries.slice(i, i + SNS_MAX_BATCH_SIZE);
          const snsEntries: PublishBatchRequestEntry[] = chunk.map((entry) => ({
            Id: entry.id,
            Message: JSON.stringify(entry.body),
            MessageGroupId: entry.options?.groupId,
            MessageDeduplicationId: entry.options?.deduplicationId,
            Subject: entry.options?.subject,
            MessageAttributes: entry.options?.attributes
              ? toSNSAttributes(entry.options.attributes)
              : undefined,
          }));

          try {
            const result = await this.client.send(
              new PublishBatchCommand({
                TopicArn: this.topicArn,
                PublishBatchRequestEntries: snsEntries,
              }),
            );

            for (const s of result.Successful ?? []) {
              successful.push({ id: s.Id!, messageId: s.MessageId! });
            }
            for (const f of result.Failed ?? []) {
              failed.push({ id: f.Id!, code: f.Code!, message: f.Message ?? "Unknown error" });
            }
          } catch (error) {
            throw new TopicError(
              `Failed to publish message batch to topic "${this.topicArn}"`,
              this.topicArn,
              { cause: error },
            );
          }
        }

        return { successful, failed };
      },
    );
  }

  private traced<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    fn: (span?: CeleritySpan) => Promise<T>,
  ): Promise<T> {
    if (!this.tracer) return fn();
    return this.tracer.withSpan(name, (span) => fn(span), attributes);
  }
}

function toSNSAttributes(attrs: Record<string, string>): Record<string, MessageAttributeValue> {
  const result: Record<string, MessageAttributeValue> = {};
  for (const [key, value] of Object.entries(attrs)) {
    result[key] = { DataType: "String", StringValue: value };
  }
  return result;
}
