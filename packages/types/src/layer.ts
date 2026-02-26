import type { BaseHandlerContext } from "./handler";
import type { HttpHandlerContext } from "./http";

export type HandlerResponse = unknown;

export type NextFunction = () => Promise<unknown>;

export interface CelerityLayer<TContext extends BaseHandlerContext = HttpHandlerContext> {
  handle(context: TContext, next: NextFunction): Promise<unknown>;
  dispose?(): Promise<void> | void;
}
