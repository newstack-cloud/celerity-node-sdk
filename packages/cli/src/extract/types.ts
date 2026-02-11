export type DependencyNode = {
  token: string;
  tokenType: "class" | "string" | "symbol";
  providerType: "class" | "factory" | "value";
  dependencies: string[];
};

export type DependencyGraph = {
  nodes: DependencyNode[];
};

export type HandlerManifest = {
  version: "1.0.0";
  handlers: ClassHandlerEntry[];
  functionHandlers: FunctionHandlerEntry[];
  dependencyGraph: DependencyGraph;
};

export type ClassHandlerEntry = {
  resourceName: string;
  className: string;
  methodName: string;
  sourceFile: string;
  handlerType: "http" | "websocket" | "consumer" | "schedule";
  annotations: Record<string, string | string[] | boolean>;
  spec: {
    handlerName: string;
    codeLocation: string;
    handler: string;
    timeout?: number;
  };
};

export type FunctionHandlerEntry = {
  resourceName: string;
  exportName: string;
  sourceFile: string;
  annotations?: Record<string, string | string[] | boolean>;
  spec: {
    handlerName: string;
    codeLocation: string;
    handler: string;
  };
};
