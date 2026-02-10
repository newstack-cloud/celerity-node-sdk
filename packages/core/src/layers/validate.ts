import type { CelerityLayer, HandlerContext, HandlerResponse, Schema } from "@celerity-sdk/types";
import { BadRequestException } from "../errors/http-exception";

export type ValidationSchemas = {
  body?: Schema;
  params?: Schema;
  query?: Schema;
  headers?: Schema;
};

class ValidationLayer implements CelerityLayer {
  constructor(private schemas: ValidationSchemas) {}

  async handle(
    context: HandlerContext,
    next: () => Promise<HandlerResponse>,
  ): Promise<HandlerResponse> {
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

    return next();
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

export function validate(schemas: ValidationSchemas): CelerityLayer {
  return new ValidationLayer(schemas);
}
