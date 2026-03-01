export { INJECT_METADATA, USE_RESOURCE_METADATA } from "@celerity-sdk/common";

export const CONTROLLER_METADATA = Symbol.for("celerity:controller");
export const HTTP_METHOD_METADATA = Symbol.for("celerity:http-method");
export const ROUTE_PATH_METADATA = Symbol.for("celerity:route-path");
export const PARAM_METADATA = Symbol.for("celerity:param");
export const GUARD_PROTECTEDBY_METADATA = Symbol.for("celerity:guard:protectedBy");
export const GUARD_CUSTOM_METADATA = Symbol.for("celerity:guard:custom");
export const LAYER_METADATA = Symbol.for("celerity:layer");
export const MODULE_METADATA = Symbol.for("celerity:module");
export const INJECTABLE_METADATA = Symbol.for("celerity:injectable");
export const PUBLIC_METADATA = Symbol.for("celerity:public");
export const CUSTOM_METADATA = Symbol.for("celerity:custom-metadata");
export const WEBSOCKET_CONTROLLER_METADATA = Symbol.for("celerity:websocket-controller");
export const WEBSOCKET_EVENT_METADATA = Symbol.for("celerity:websocket-event");
export const CONSUMER_METADATA = Symbol.for("celerity:consumer");
export const CONSUMER_HANDLER_METADATA = Symbol.for("celerity:consumer-handler");
export const SCHEDULE_HANDLER_METADATA = Symbol.for("celerity:schedule-handler");
export const INVOKE_METADATA = Symbol.for("celerity:invoke");
