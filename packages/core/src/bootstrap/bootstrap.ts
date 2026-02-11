import "reflect-metadata";
import createDebug from "debug";
import type { Type } from "@celerity-sdk/types";
import { Container } from "../di/container";
import { HandlerRegistry } from "../handlers/registry";
import { walkModuleGraph, validateModuleGraph } from "./module-graph";

const debug = createDebug("celerity:core:bootstrap");

export type BootstrapResult = {
  container: Container;
  registry: HandlerRegistry;
};

/** Bootstrap DI container + handler registry from a root module class. */
export async function bootstrap(rootModule: Type): Promise<BootstrapResult> {
  debug("bootstrap: starting from %s", rootModule.name);
  const container = new Container();
  const registry = new HandlerRegistry();

  const graph = walkModuleGraph(rootModule, container);
  validateModuleGraph(graph, container);
  await registry.populateFromGraph(graph, container);

  debug(
    "bootstrap: complete — %d modules, %d handlers",
    graph.size,
    registry.getAllHandlers().length,
  );
  return { container, registry };
}
