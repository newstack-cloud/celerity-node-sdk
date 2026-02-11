/**
 * Dotted module name fixture — tests resolution of handler references
 * where the module name itself contains a dot (e.g. "dotted.module" → default export).
 */
export default function () {
  return { message: "I am the dotted module!" };
}
