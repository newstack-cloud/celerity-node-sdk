export type Platform = "aws" | "gcp" | "azure" | "local" | "other";

export type DeployTarget = "functions" | "runtime";

const PLATFORM_MAP: Record<string, Platform> = {
  aws: "aws",
  gcp: "gcp",
  azure: "azure",
  local: "local",
};

export class CelerityConfig {
  static getAppVar(name: string): string | undefined {
    return process.env[`CELERITY_APP_${name}`];
  }

  static getAllAppVars(): Record<string, string> {
    const prefix = "CELERITY_APP_";
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && value !== undefined) {
        result[key.slice(prefix.length)] = value;
      }
    }
    return result;
  }

  static getSecret(name: string): string | undefined {
    return process.env[`CELERITY_SECRET_${name}`];
  }

  static getVariable(name: string): string | undefined {
    return process.env[`CELERITY_VARIABLE_${name}`];
  }

  static getPlatform(): Platform {
    const raw = process.env.CELERITY_PLATFORM?.toLowerCase() ?? "";
    return PLATFORM_MAP[raw] ?? "other";
  }
}
