import type { Knex } from "knex";
import type { Closeable } from "@celerity-sdk/types";

export class SqlDatabaseInstance implements Closeable {
  private readonly _writer: Knex;
  private readonly _reader: Knex;

  constructor(writer: Knex, reader?: Knex) {
    this._writer = writer;
    this._reader = reader ?? writer;
  }

  writer(): Knex {
    return this._writer;
  }

  reader(): Knex {
    return this._reader;
  }

  async close(): Promise<void> {
    await this._writer.destroy();
    // Only destroy reader if it's a separate instance
    if (this._reader !== this._writer) {
      await this._reader.destroy();
    }
  }
}
