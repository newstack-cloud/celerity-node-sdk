export {
  buildScannedModule,
  validateScannedDependencies,
  type ScannedModule,
  type DependencyDiagnostic,
} from "./extract/metadata-app";
export { serializeManifest, type SerializeOptions } from "./extract/serializer";
export { joinHandlerPath } from "./extract/path-utils";
export {
  deriveClassResourceName,
  deriveClassHandlerName,
  deriveClassHandlerFunction,
  deriveFunctionResourceName,
  deriveFunctionHandlerFunction,
  deriveCodeLocation,
} from "./extract/identity";
export type { HandlerManifest, ClassHandlerEntry, FunctionHandlerEntry } from "./extract/types";
