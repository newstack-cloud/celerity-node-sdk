import { randomUUID } from "node:crypto";
import createDebug from "debug";
import type Redis from "ioredis";
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

const debug = createDebug("celerity:topic:redis");

export class RedisTopic implements Topic {
  constructor(
    private readonly channelName: string,
    private readonly client: Redis,
    private readonly tracer?: CelerityTracer,
  ) {}

  async publish<T = Record<string, unknown>>(
    body: T,
    options?: PublishOptions,
  ): Promise<PublishResult> {
    debug("publish %s", this.channelName);
    return this.traced(
      "celerity.topic.publish",
      { "topic.channel": this.channelName },
      async () => {
        try {
          const messageId = randomUUID();
          const payload = buildEnvelope(body, messageId, options);
          await this.client.publish(this.channelName, payload);
          return { messageId };
        } catch (error) {
          throw new TopicError(
            `Failed to publish message to channel "${this.channelName}"`,
            this.channelName,
            { cause: error },
          );
        }
      },
    );
  }

  async publishBatch<T = Record<string, unknown>>(
    entries: BatchPublishEntry<T>[],
  ): Promise<BatchPublishResult> {
    debug("publishBatch %s (%d entries)", this.channelName, entries.length);
    return this.traced(
      "celerity.topic.publish_batch",
      { "topic.channel": this.channelName, "topic.message_count": entries.length },
      async () => {
        const successful: BatchPublishSuccess[] = [];
        const failed: BatchPublishFailure[] = [];

        const messageIds: string[] = [];
        const pipeline = this.client.pipeline();
        for (const entry of entries) {
          const messageId = randomUUID();
          messageIds.push(messageId);
          const payload = buildEnvelope(entry.body, messageId, entry.options);
          pipeline.publish(this.channelName, payload);
        }

        try {
          const results = await pipeline.exec();
          if (!results) {
            throw new Error("Pipeline returned null");
          }

          for (let i = 0; i < entries.length; i++) {
            const [err] = results[i];
            if (err) {
              failed.push({
                id: entries[i].id,
                code: err.name ?? "PipelineError",
                message: err.message,
              });
            } else {
              successful.push({
                id: entries[i].id,
                messageId: messageIds[i],
              });
            }
          }
        } catch (error) {
          throw new TopicError(
            `Failed to publish message batch to channel "${this.channelName}"`,
            this.channelName,
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
 * Builds the JSON envelope published to the pub/sub channel.
 * The local-events bridge parses this envelope and extracts individual
 * fields when writing to target consumer streams.
 *
 * `messageId`, `subject`, and `attributes` are included in the envelope.
 * `groupId` and `deduplicationId` are silently ignored — ordering is
 * inherent in the single-instance bridge architecture.
 */
function buildEnvelope<T>(body: T, messageId: string, options?: PublishOptions): string {
  const envelope: Record<string, unknown> = {
    body: JSON.stringify(body),
    messageId,
  };

  if (options?.subject) {
    envelope.subject = options.subject;
  }
  if (options?.attributes && Object.keys(options.attributes).length > 0) {
    envelope.attributes = options.attributes;
  }

  return JSON.stringify(envelope);
}
