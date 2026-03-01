import "reflect-metadata";
import { INVOKE_METADATA } from "../metadata/constants";

export type InvokeMetadata = {
  name: string;
};

/**
 * Marks a method as a custom/invocable handler — a programmatic invocation
 * endpoint identified by name, callable via `app.invokeHandler(name, payload)`
 * or the runtime's `/runtime/handlers/invoke` endpoint.
 *
 * This is a **cross-cutting** method decorator that works on any controller
 * type (`@Controller`, `@WebSocketController`, `@Consumer`). A single class
 * can mix HTTP routes, scheduled tasks, and invocable methods.
 *
 * @param name - The handler name used for invocation lookup. Must be unique
 *   across all registered custom handlers.
 *
 * @example
 * ```ts
 * // Standalone invocable handler
 * @Controller()
 * class PaymentHandlers {
 *   @Invoke("processPayment")
 *   async process(@Payload(PaymentSchema) payload: PaymentInput): Promise<PaymentResult> {
 *     return this.paymentService.process(payload);
 *   }
 * }
 *
 * // Mixed: HTTP routes + invocable methods
 * @Controller("/payments")
 * class PaymentController {
 *   @Get("/{id}")
 *   async getPayment(@Param("id") id: string): Promise<HandlerResponse> { ... }
 *
 *   @Invoke("processPayment")
 *   async processPayment(@Payload(PaymentSchema) payload: PaymentInput): Promise<PaymentResult> {
 *     return this.paymentService.process(payload);
 *   }
 * }
 * ```
 */
export function Invoke(name: string): MethodDecorator {
  return (target, propertyKey) => {
    const meta: InvokeMetadata = { name };
    Reflect.defineMetadata(INVOKE_METADATA, meta, target, propertyKey);
  };
}
