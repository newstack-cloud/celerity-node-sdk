import type { CelerityLogger, CelerityTracer, ServiceContainer } from "@celerity-sdk/types";
import { LOGGER_TOKEN, TRACER_TOKEN } from "./tokens";

export async function getLogger(container: ServiceContainer): Promise<CelerityLogger> {
  return container.resolve<CelerityLogger>(LOGGER_TOKEN);
}

export async function getTracer(container: ServiceContainer): Promise<CelerityTracer> {
  return container.resolve<CelerityTracer>(TRACER_TOKEN);
}
