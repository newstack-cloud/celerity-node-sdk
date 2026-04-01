import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Injectable, Inject, Module } from "@celerity-sdk/core";
import { discoverResourceTokens } from "../src/discovery";

const USERS_DS = Symbol.for("celerity:datastore:usersDatastore");
const EVENTS_TOPIC = Symbol.for("celerity:topic:eventsTopic");
const JOBS_QUEUE = Symbol.for("celerity:queue:jobsQueue");

@Injectable()
class UserService {
  constructor(@Inject(USERS_DS) private _ds: unknown) {}
}

@Injectable()
class EventService {
  constructor(@Inject(EVENTS_TOPIC) private _topic: unknown) {}
}

@Injectable()
class JobService {
  constructor(
    @Inject(JOBS_QUEUE) private _queue: unknown,
    @Inject(USERS_DS) private _ds: unknown,
  ) {}
}

@Injectable()
class PlainService {}

describe("discoverResourceTokens", () => {
  it("should discover resource tokens from module providers", () => {
    @Module({ providers: [UserService] })
    class TestModule {}

    const tokens = discoverResourceTokens(TestModule);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token).toBe(USERS_DS);
    expect(tokens[0].type).toBe("datastore");
    expect(tokens[0].name).toBe("usersDatastore");
  });

  it("should discover tokens from multiple providers", () => {
    @Module({ providers: [UserService, EventService] })
    class TestModule {}

    const tokens = discoverResourceTokens(TestModule);
    expect(tokens).toHaveLength(2);

    const types = tokens.map((t) => t.type);
    expect(types).toContain("datastore");
    expect(types).toContain("topic");
  });

  it("should deduplicate tokens shared across providers", () => {
    @Module({ providers: [UserService, JobService] })
    class TestModule {}

    const tokens = discoverResourceTokens(TestModule);
    const datastoreTokens = tokens.filter((t) => t.type === "datastore");
    expect(datastoreTokens).toHaveLength(1);
  });

  it("should discover tokens from imported modules", () => {
    @Module({ providers: [UserService], exports: [UserService] })
    class UserModule {}

    @Module({ imports: [UserModule], providers: [EventService] })
    class AppModule {}

    const tokens = discoverResourceTokens(AppModule);
    expect(tokens).toHaveLength(2);
  });

  it("should return empty array for modules with no resource dependencies", () => {
    @Module({ providers: [PlainService] })
    class TestModule {}

    const tokens = discoverResourceTokens(TestModule);
    expect(tokens).toHaveLength(0);
  });

  it("should return empty array for empty modules", () => {
    @Module({})
    class EmptyModule {}

    const tokens = discoverResourceTokens(EmptyModule);
    expect(tokens).toHaveLength(0);
  });
});
