import type { HandlerContext } from "./http";
import type { HttpResponse } from "./http";

export type HandlerResponse = HttpResponse;

export interface CelerityLayer<TContext extends HandlerContext = HandlerContext> {
  handle(context: TContext, next: () => Promise<HandlerResponse>): Promise<HandlerResponse>;
  dispose?(): Promise<void> | void;
}
