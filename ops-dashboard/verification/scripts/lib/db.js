// lib/db.js — tiny PG runner
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

export class DatabaseClient {
  constructor(connectionString) {
    this.client = new Client({ connectionString });
    this.connected = false;
  }

  async connect() {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.client.end();
      this.connected = false;
    }
  }

  async query(sql, params = []) {
    await this.connect();
    const result = await this.client.query(sql, params);
    return result.rows;
  }

  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  }

  async querySqlFile(filename, params = []) {
    const sqlPath = path.join(process.cwd(), 'verification', 'sql', filename);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    return await this.query(sql, params);
  }

  async querySqlFileOne(filename, params = []) {
    const rows = await this.querySqlFile(filename, params);
    return rows[0] || null;
  }
}