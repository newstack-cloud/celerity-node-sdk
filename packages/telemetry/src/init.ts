import createDebug from "debug";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { CompositePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { AWSXRayPropagator } from "@opentelemetry/propagator-aws-xray";
import { AWSXRayIdGenerator } from "@opentelemetry/id-generator-aws-xray";
import { readTelemetryEnv } from "./env";
import { buildInstrumentations } from "./instrumentations";

const debug = createDebug("celerity:telemetry");

let initialized = false;
let sdk: NodeSDK | null = null;

export function isInitialized(): boolean {
  return initialized;
}

export async function initTelemetry(): Promise<void> {
  if (initialized) {
    debug("initTelemetry: already initialized, skipping");
    return;
  }

  const config = readTelemetryEnv();
  if (!config.tracingEnabled) {
    debug("initTelemetry: tracing disabled, skipping");
    return;
  }

  const platform = process.env.CELERITY_RUNTIME_PLATFORM ?? "local";
  const isAws = platform === "aws";
  debug(
    "initTelemetry: platform=%s endpoint=%s service=%s",
    platform,
    config.otlpEndpoint,
    config.serviceName,
  );

  const instrumentations = await buildInstrumentations();

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion,
    }),
    traceExporter: new OTLPTraceExporter({ url: config.otlpEndpoint }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(new OTLPLogExporter({ url: config.otlpEndpoint })),
    ],
    textMapPropagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new AWSXRayPropagator()],
    }),
    ...(isAws ? { idGenerator: new AWSXRayIdGenerator() } : {}),
    instrumentations,
  });

  sdk.start();
  initialized = true;
  debug("initTelemetry: SDK started");
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    debug("shutdownTelemetry: shutting down SDK");
    await sdk.shutdown();
    sdk = null;
    initialized = false;
  }
}
