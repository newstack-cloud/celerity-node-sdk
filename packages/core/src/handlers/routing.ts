import { ResolvedHandler } from "./types";

export function routingKeyOf(handler: ResolvedHandler): string {
  switch (handler.type) {
    case "http":
      return `${handler.method} ${handler.path}`;
    case "websocket":
      return handler.route;
    case "consumer":
      return handler.handlerTag;
    case "schedule":
      return handler.handlerTag;
    case "custom":
      return handler.name;
  }
}
