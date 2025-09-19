// Database connection and configuration for SettlePaisa reconciliation system
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Database configuration
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/settlepaisa_recon';

// Create postgres client
const client = postgres(DATABASE_URL, {
  max: 10, // Maximum number of connections
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
});

// Create drizzle instance
export const db = drizzle(client, { schema });

// Connection health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await client`SELECT 1 as health_check`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Close database connection (for cleanup)
export async function closeDatabaseConnection(): Promise<void> {
  await client.end();
}

// Transaction wrapper for complex operations
export async function withTransaction<T>(
  callback: (tx: any) => Promise<T>
): Promise<T> {
  return db.transaction(callback);
}

// Database initialization function
export async function initializeDatabase(): Promise<void> {
  const isHealthy = await checkDatabaseConnection();
  if (!isHealthy) {
    throw new Error('Failed to connect to database');
  }
  console.log('✅ Database connection established');
}

export type Database = typeof db;
export default db;