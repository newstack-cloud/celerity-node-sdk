import "reflect-metadata";
import type { Type } from "@celerity-sdk/types";
import { Container } from "../di/container";
import { HandlerRegistry } from "../handlers/registry";
import { walkModuleGraph, validateModuleGraph } from "./module-graph";

export type BootstrapResult = {
  container: Container;
  registry: HandlerRegistry;
};

/** Bootstrap DI container + handler registry from a root module class. */
export async function bootstrap(rootModule: Type): Promise<BootstrapResult> {
  const container = new Container();
  const registry = new HandlerRegistry();

  const graph = walkModuleGraph(rootModule, container);
  validateModuleGraph(graph, container);
  await registry.populateFromGraph(graph, container);

  return { container, registry };
}
