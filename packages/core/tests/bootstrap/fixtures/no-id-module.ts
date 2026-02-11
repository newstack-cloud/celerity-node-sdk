import "reflect-metadata";
import { Module } from "../../../src/decorators/module";
import { greet } from "./no-id-handlers";

@Module({
  functionHandlers: [greet],
})
export default class NoIdModule {}
