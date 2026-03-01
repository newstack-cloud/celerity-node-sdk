import type {
  BaseHandlerContext,
  CelerityLayer,
  ConsumerHandlerContext,
  HandlerType,
  HttpHandlerContext,
  MessageProcessingFailure,
  Schema,
  ScheduleHandlerContext,
  ValidatedConsumerMessage,
  WebSocketHandlerContext,
} from "@celerity-sdk/types";
import { BadRequestException } from "../errors/http-exception";

export type ValidationSchemas = {
  // HTTP
  body?: Schema;
  params?: Schema;
  query?: Schema;
  headers?: Schema;
  // WebSocket
  wsMessageBody?: Schema;
  // Consumer
  consumerMessage?: Schema;
  // Schedule
  scheduleInput?: Schema;
  // Custom
  customPayload?: Schema;
};

function inferMode(schemas: ValidationSchemas): HandlerType {
  if (schemas.consumerMessage) return "consumer";
  if (schemas.scheduleInput) return "schedule";
  if (schemas.customPayload) return "custom";
  if (schemas.wsMessageBody) return "websocket";
  return "http";
}

class ValidationLayer implements CelerityLayer<BaseHandlerContext> {
  private readonly mode: HandlerType;

  constructor(private schemas: ValidationSchemas) {
    this.mode = inferMode(schemas);
  }

  supports(handlerType: HandlerType): boolean {
    return handlerType === this.mode;
  }

  async handle(context: BaseHandlerContext, next: () => Promise<unknown>): Promise<unknown> {
    switch (this.mode) {
      case "http":
        this.validateHttp(context as HttpHandlerContext);
        break;
      case "websocket":
        this.validateWebSocket(context as WebSocketHandlerContext);
        break;
      case "consumer":
        this.validateConsumer(context as ConsumerHandlerContext);
        break;
      case "schedule":
        this.validateSchedule(context as ScheduleHandlerContext);
        break;
      case "custom":
        this.validateCustom(context);
        break;
    }
    return next();
  }

  private validateHttp(context: HttpHandlerContext): void {
    const { request } = context;

    if (this.schemas.body && request.textBody) {
      try {
        const raw = JSON.parse(request.textBody);
        context.metadata.set("validatedBody", this.schemas.body.parse(raw));
      } catch (error) {
        throw new BadRequestException("Body validation failed", formatError(error));
      }
    }

    if (this.schemas.params) {
      try {
        context.metadata.set("validatedParams", this.schemas.params.parse(request.pathParams));
      } catch (error) {
        throw new BadRequestException("Path params validation failed", formatError(error));
      }
    }

    if (this.schemas.query) {
      try {
        context.metadata.set("validatedQuery", this.schemas.query.parse(request.query));
      } catch (error) {
        throw new BadRequestException("Query validation failed", formatError(error));
      }
    }

    if (this.schemas.headers) {
      try {
        context.metadata.set("validatedHeaders", this.schemas.headers.parse(request.headers));
      } catch (error) {
        throw new BadRequestException("Headers validation failed", formatError(error));
      }
    }
  }

  private validateWebSocket(context: WebSocketHandlerContext): void {
    const schema = this.schemas.wsMessageBody;
    if (!schema) return;

    const body = context.message.jsonBody;
    if (body === undefined) return;

    context.metadata.set("validatedMessageBody", schema.parse(body));
  }

  private validateConsumer(context: ConsumerHandlerContext): void {
    const schema = this.schemas.consumerMessage;
    if (!schema) return;

    const validated: ValidatedConsumerMessage<unknown>[] = [];
    const failures: MessageProcessingFailure[] = [];

    for (const msg of context.event.messages) {
      try {
        const parsed = JSON.parse(msg.body);
        const result = schema.parse(parsed);
        validated.push({ ...msg, parsedBody: result });
      } catch (err) {
        failures.push({
          messageId: msg.messageId,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    context.metadata.set("validatedMessages", validated);
    if (failures.length > 0) {
      context.metadata.set("validationFailures", failures);
    }
  }

  private validateSchedule(context: ScheduleHandlerContext): void {
    const schema = this.schemas.scheduleInput;
    if (!schema) return;

    context.metadata.set("validatedInput", schema.parse(context.event.input));
  }

  private validateCustom(context: BaseHandlerContext): void {
    const schema = this.schemas.customPayload;
    if (!schema) return;

    const raw = context.metadata.get("rawPayload");
    context.metadata.set("validatedPayload", schema.parse(raw));
  }
}

function formatError(error: unknown): unknown {
  if (error instanceof Error && "issues" in error) {
    return (error as Error & { issues: unknown }).issues;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return error;
}

export function validate(schemas: ValidationSchemas): CelerityLayer<BaseHandlerContext> {
  return new ValidationLayer(schemas);
}
