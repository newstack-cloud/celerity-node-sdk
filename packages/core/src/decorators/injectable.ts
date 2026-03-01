import "reflect-metadata";
import type { InjectionToken } from "@celerity-sdk/types";
import { INJECTABLE_METADATA, INJECT_METADATA } from "../metadata/constants";

/**
 * Marks a class as injectable into the DI container. Required for any class
 * that should be resolved as a dependency — services, repositories, etc.
 *
 * Controller and handler decorators (`@Controller`, `@WebSocketController`,
 * `@Consumer`, `@Guard`) set this automatically, so `@Injectable()` is only
 * needed for non-handler service classes.
 *
 * @example
 * ```ts
 * @Injectable()
 * class OrderService {
 *   constructor(private db: DatabaseClient) {}
 * }
 * ```
 */
export function Injectable(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(INJECTABLE_METADATA, true, target);
  };
}

/**
 * Overrides the DI token for a constructor parameter. By default the container
 * resolves dependencies using the class type from `emitDecoratorMetadata`. Use
 * `@Inject()` when you need to inject by a symbol, string token, or abstract
 * class that differs from the declared parameter type.
 *
 * @param token - The DI token (class, symbol, or string) to resolve.
 *
 * @example
 * ```ts
 * @Injectable()
 * class OrderService {
 *   constructor(@Inject(DB_TOKEN) private db: DatabaseClient) {}
 * }
 * ```
 */
export function Inject(token: InjectionToken): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const existing: Map<number, InjectionToken> =
      Reflect.getOwnMetadata(INJECT_METADATA, target) ?? new Map();
    existing.set(parameterIndex, token);
    Reflect.defineMetadata(INJECT_METADATA, existing, target);
  };
}
