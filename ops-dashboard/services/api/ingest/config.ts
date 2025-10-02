const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Feature flag check
export const isFeatureEnabled = (): boolean => {
  return process.env.FEATURE_BANK_SFTP_INGESTION === 'true';
};

// Database connection
export const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'settlepaisa_ops',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// SFTP Configuration Types
export interface SftpConfig {
  host: string;
  port: number;
  user: string;
  path: string;
  password?: string;
  privateKey?: string;
}

export interface FilenameConfig {
  pattern: string;
  seq_width: number;
}

export interface CompletionConfig {
  method: 'rename' | 'marker' | 'checksum' | 'manifest' | 'marker_or_rename';
  marker_suffix?: string;
  temp_suffixes?: string[];
  checksum_suffix?: string;
  manifest_pattern?: string;
}

export interface ValidationConfig {
  min_size_bytes: number;
  header_required: boolean;
  row_count_from: 'none' | 'trailer' | 'manifest' | 'manifest_or_trailer';
}

export interface PgpConfig {
  verify: boolean;
  public_key_id?: string;
}

export interface BankIngestConfig {
  id?: number;
  bank: string;
  sftp: SftpConfig;
  filename: FilenameConfig;
  timezone: string;
  cutoffs: string[];
  grace_minutes: number;
  completion: CompletionConfig;
  validation: ValidationConfig;
  pgp?: PgpConfig;
  active?: boolean;
}

// Load bank configurations from database
export async function loadBankConfigs(): Promise<BankIngestConfig[]> {
  try {
    const result = await db.query(`
      SELECT 
        id,
        bank,
        sftp_config as sftp,
        filename_config as filename,
        timezone,
        cutoffs,
        grace_minutes,
        completion_config as completion,
        validation_config as validation,
        pgp_config as pgp,
        active
      FROM bank_ingest_configs
      WHERE active = true
    `);

    return result.rows.map(row => ({
      id: row.id,
      bank: row.bank,
      sftp: row.sftp,
      filename: row.filename,
      timezone: row.timezone,
      cutoffs: row.cutoffs,
      grace_minutes: row.grace_minutes,
      completion: row.completion,
      validation: row.validation,
      pgp: row.pgp,
      active: row.active
    }));
  } catch (error) {
    console.error('Error loading bank configs:', error);
    return [];
  }
}

// Get single bank configuration
export async function getBankConfig(bank: string): Promise<BankIngestConfig | null> {
  try {
    const result = await db.query(`
      SELECT 
        id,
        bank,
        sftp_config as sftp,
        filename_config as filename,
        timezone,
        cutoffs,
        grace_minutes,
        completion_config as completion,
        validation_config as validation,
        pgp_config as pgp,
        active
      FROM bank_ingest_configs
      WHERE bank = $1 AND active = true
    `, [bank]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      bank: row.bank,
      sftp: row.sftp,
      filename: row.filename,
      timezone: row.timezone,
      cutoffs: row.cutoffs,
      grace_minutes: row.grace_minutes,
      completion: row.completion,
      validation: row.validation,
      pgp: row.pgp,
      active: row.active
    };
  } catch (error) {
    console.error('Error loading bank config:', error);
    return null;
  }
}

// Configuration constants
export const SFTP_POLL_INTERVAL = parseInt(process.env.SFTP_POLL_INTERVAL_MS || '60000');
export const SFTP_STAGING_DIR = process.env.SFTP_STAGING_DIR || '/tmp/sftp-staging';
export const MAX_DOWNLOAD_RETRIES = 3;
export const HEALTH_LAG_THRESHOLD_MINUTES = 360; // 6 hours for DOWN status