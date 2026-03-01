import type { BaseHandlerContext, HandlerType } from "./handler";
import type { HttpHandlerContext } from "./http";

export type HandlerResponse = unknown;

export type NextFunction = () => Promise<unknown>;

export interface CelerityLayer<TContext extends BaseHandlerContext = HttpHandlerContext> {
  /** When defined, the layer only executes for the returned handler types. Omit to run for all types. */
  supports?(handlerType: HandlerType): boolean;
  handle(context: TContext, next: NextFunction): Promise<unknown>;
  dispose?(): Promise<void> | void;
}
