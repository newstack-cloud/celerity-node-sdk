export const httpOnly = {
  __celerity_handler: true,
  type: "http",
  metadata: { path: "/test", method: "GET", layers: [], inject: [] },
  handler: async () => ({ status: 200, body: "ok" }),
};
