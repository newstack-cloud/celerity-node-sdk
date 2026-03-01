import createDebug from "debug";
import type { ServerlessHandler } from "@celerity-sdk/core";
import { CelerityFactory, discoverModule } from "@celerity-sdk/core";
import { ServerlessApplication } from "@celerity-sdk/core";
import { detectEventType } from "./event-mapper";
import { AwsLambdaAdapter } from "./adapter";

const debug = createDebug("celerity:serverless-aws");

let app: ServerlessApplication | null = null;
let cachedHandler: ServerlessHandler | null = null;
let shutdownRegistered = false;

async function ensureBootstrapped(): Promise<ServerlessApplication> {
  if (!app) {
    debug("entry: cold start, bootstrapping via CelerityFactory");
    const rootModule = await discoverModule();
    app = (await CelerityFactory.create(rootModule, {
      adapter: new AwsLambdaAdapter(),
    })) as ServerlessApplication;
    debug("entry: bootstrap complete");
  }
  return app;
}

function registerShutdownHandler(application: ServerlessApplication): void {
  if (shutdownRegistered) return;
  shutdownRegistered = true;
  debug("entry: SIGTERM shutdown handler registered");
  process.on("SIGTERM", async () => {
    await application.close();
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Unified Lambda handler
// ---------------------------------------------------------------------------

export async function handler(event: unknown, context: unknown): Promise<unknown> {
  const application = await ensureBootstrapped();
  registerShutdownHandler(application);

  if (!cachedHandler) {
    const eventType = detectEventType(event);
    debug("entry: creating handler for type=%s", eventType);
    cachedHandler = application.createHandler(eventType);
  }

  return cachedHandler(event, context);
}
