export const processQueue = {
  __celerity_handler: true,
  type: "consumer",
  metadata: { route: "orders-queue", layers: [], inject: [] },
  handler: async () => ({ success: true, failures: [] }),
};
