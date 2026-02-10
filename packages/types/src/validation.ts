export interface Schema<T = unknown> {
  parse(data: unknown): T;
}

export type ValidationError = {
  path: string[];
  message: string;
};

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };
