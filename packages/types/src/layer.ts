import type { HandlerContext } from "./http";
import type { HttpResponse } from "./http";

export type HandlerResponse = HttpResponse;

export type NextFunction = () => Promise<HandlerResponse>;

export interface CelerityLayer<TContext extends HandlerContext = HandlerContext> {
  handle(context: TContext, next: NextFunction): Promise<HandlerResponse>;
  dispose?(): Promise<void> | void;
}
