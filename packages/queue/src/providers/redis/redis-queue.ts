import createDebug from "debug";
import type Redis from "ioredis";
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

const debug = createDebug("celerity:queue:redis");

export class RedisQueue implements Queue {
  constructor(
    private readonly streamName: string,
    private readonly client: Redis,
    private readonly tracer?: CelerityTracer,
  ) {}

  async sendMessage<T = Record<string, unknown>>(
    body: T,
    options?: SendMessageOptions,
  ): Promise<SendMessageResult> {
    debug("sendMessage %s", this.streamName);
    return this.traced(
      "celerity.queue.send_message",
      { "queue.stream": this.streamName },
      async () => {
        try {
          const fields = buildStreamFields(body, options);
          const messageId = await this.client.xadd(this.streamName, "*", ...fields);
          return { messageId: messageId! };
        } catch (error) {
          throw new QueueError(
            `Failed to send message to stream "${this.streamName}"`,
            this.streamName,
            { cause: error },
          );
        }
      },
    );
  }

  async sendMessageBatch<T = Record<string, unknown>>(
    entries: BatchSendEntry<T>[],
  ): Promise<BatchSendResult> {
    debug("sendMessageBatch %s (%d entries)", this.streamName, entries.length);
    return this.traced(
      "celerity.queue.send_message_batch",
      { "queue.stream": this.streamName, "queue.message_count": entries.length },
      async () => {
        const successful: BatchSendSuccess[] = [];
        const failed: BatchSendFailure[] = [];

        const pipeline = this.client.pipeline();
        for (const entry of entries) {
          const fields = buildStreamFields(entry.body, entry.options);
          pipeline.xadd(this.streamName, "*", ...fields);
        }

        try {
          const results = await pipeline.exec();
          if (!results) {
            throw new Error("Pipeline returned null");
          }

          for (let i = 0; i < entries.length; i++) {
            const [err, messageId] = results[i];
            if (err) {
              failed.push({
                id: entries[i].id,
                code: err.name ?? "PipelineError",
                message: err.message,
              });
            } else {
              successful.push({
                id: entries[i].id,
                messageId: messageId as string,
              });
            }
          }
        } catch (error) {
          throw new QueueError(
            `Failed to send message batch to stream "${this.streamName}"`,
            this.streamName,
            { cause: error },
          );
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

/**
 * Builds the flat field array for XADD in the format the runtime consumer
 * and local-events sidecar expect.
 */
function buildStreamFields<T>(body: T, options?: SendMessageOptions): string[] {
  const fields: string[] = [
    "body",
    JSON.stringify(body),
    "timestamp",
    String(Math.floor(Date.now() / 1000)),
    "message_type",
    "0",
  ];

  if (options?.groupId) {
    fields.push("group_id", options.groupId);
  }
  if (options?.deduplicationId) {
    fields.push("dedup_id", options.deduplicationId);
  }
  if (options?.attributes && Object.keys(options.attributes).length > 0) {
    fields.push("attributes", JSON.stringify(options.attributes));
  }

  return fields;
}
