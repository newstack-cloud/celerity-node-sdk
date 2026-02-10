export interface Schema<T = unknown> {
  parse(data: unknown): T;
}
