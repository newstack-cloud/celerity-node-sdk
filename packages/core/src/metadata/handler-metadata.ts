import type { HandlerMetadata } from "@celerity-sdk/types";

export class HandlerMetadataStore implements HandlerMetadata {
  private readonly decoratorData: ReadonlyMap<string, unknown>;
  private readonly requestData = new Map<string, unknown>();

  constructor(decoratorMetadata: Record<string, unknown>) {
    this.decoratorData = new Map(Object.entries(decoratorMetadata));
  }

  get<T = unknown>(key: string): T | undefined {
    if (this.requestData.has(key)) return this.requestData.get(key) as T | undefined;
    return this.decoratorData.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.requestData.set(key, value);
  }

  has(key: string): boolean {
    return this.requestData.has(key) || this.decoratorData.has(key);
  }
}
