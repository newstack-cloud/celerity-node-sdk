import createDebug from "debug";
import {
  type SQSClient,
  SendMessageCommand,
  SendMessageBatchCommand,
  type MessageAttributeValue,
  type SendMessageBatchRequestEntry,
} from "@aws-sdk/client-sqs";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";
import type {
  Queue,
  SendMessageOptions,
  SendMessageResult,
  BatchSendEntry,
  BatchSendResult,
  BatchSendSuccess,
  BatchSendFailure,
} from "../../types";
import { QueueError } from "../../errors";

const debug = createDebug("celerity:queue:sqs");

const SQS_MAX_BATCH_SIZE = 10;

export class SQSQueue implements Queue {
  constructor(
    private readonly queueUrl: string,
    private readonly client: SQSClient,
    private readonly tracer?: CelerityTracer,
  ) {}

  async sendMessage<T = Record<string, unknown>>(
    body: T,
    options?: SendMessageOptions,
  ): Promise<SendMessageResult> {
    debug("sendMessage %s", this.queueUrl);
    return this.traced("celerity.queue.send_message", { "queue.url": this.queueUrl }, async () => {
      try {
        const result = await this.client.send(
          new SendMessageCommand({
            QueueUrl: this.queueUrl,
            MessageBody: JSON.stringify(body),
            MessageGroupId: options?.groupId,
            MessageDeduplicationId: options?.deduplicationId,
            DelaySeconds: options?.delaySeconds,
            MessageAttributes: options?.attributes
              ? toSQSAttributes(options.attributes)
              : undefined,
          }),
        );
        return { messageId: result.MessageId! };
      } catch (error) {
        throw new QueueError(`Failed to send message to queue "${this.queueUrl}"`, this.queueUrl, {
          cause: error,
        });
      }
    });
  }

  async sendMessageBatch<T = Record<string, unknown>>(
    entries: BatchSendEntry<T>[],
  ): Promise<BatchSendResult> {
    debug("sendMessageBatch %s (%d entries)", this.queueUrl, entries.length);
    return this.traced(
      "celerity.queue.send_message_batch",
      { "queue.url": this.queueUrl, "queue.message_count": entries.length },
      async () => {
        const successful: BatchSendSuccess[] = [];
        const failed: BatchSendFailure[] = [];

        // Auto-chunk into groups of 10 (SQS limit)
        for (let i = 0; i < entries.length; i += SQS_MAX_BATCH_SIZE) {
          const chunk = entries.slice(i, i + SQS_MAX_BATCH_SIZE);
          const sqsEntries: SendMessageBatchRequestEntry[] = chunk.map((entry) => ({
            Id: entry.id,
            MessageBody: JSON.stringify(entry.body),
            MessageGroupId: entry.options?.groupId,
            MessageDeduplicationId: entry.options?.deduplicationId,
            DelaySeconds: entry.options?.delaySeconds,
            MessageAttributes: entry.options?.attributes
              ? toSQSAttributes(entry.options.attributes)
              : undefined,
          }));

          try {
            const result = await this.client.send(
              new SendMessageBatchCommand({
                QueueUrl: this.queueUrl,
                Entries: sqsEntries,
              }),
            );

            for (const s of result.Successful ?? []) {
              successful.push({ id: s.Id!, messageId: s.MessageId! });
            }
            for (const f of result.Failed ?? []) {
              failed.push({ id: f.Id!, code: f.Code!, message: f.Message ?? "Unknown error" });
            }
          } catch (error) {
            throw new QueueError(
              `Failed to send message batch to queue "${this.queueUrl}"`,
              this.queueUrl,
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

function toSQSAttributes(attrs: Record<string, string>): Record<string, MessageAttributeValue> {
  const result: Record<string, MessageAttributeValue> = {};
  for (const [key, value] of Object.entries(attrs)) {
    result[key] = { DataType: "String", StringValue: value };
  }
  return result;
}
