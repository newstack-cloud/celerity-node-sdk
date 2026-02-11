// Early initialization entry point for: node --import @celerity-sdk/telemetry/setup app.js
// Registers OTel auto-instrumentations before any user code loads.
// Only activates when CELERITY_TELEMETRY_ENABLED=true.
import { initTelemetry } from "./init";

await initTelemetry();
