import * as path from 'path';
import * as fs from 'fs';
import { format, parseISO, isAfter, isBefore, addMinutes } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { 
  db, 
  loadBankConfigs, 
  BankIngestConfig,
  SFTP_POLL_INTERVAL,
  SFTP_STAGING_DIR,
  isFeatureEnabled,
  HEALTH_LAG_THRESHOLD_MINUTES
} from './config';
import { SftpClient, MockSftpClient, RemoteFile } from './sftp-client';

interface FileExpectation {
  bank: string;
  window_start: Date;
  window_end: Date;
  business_date: Date;
  expected_name: string;
  expected_seq: number | null;
  required: boolean;
}

export class IngestWatcher {
  private isRunning: boolean = false;
  private intervalHandle: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    if (!isFeatureEnabled()) {
      console.log('SFTP ingestion feature is disabled');
      return;
    }

    if (this.isRunning) {
      console.log('Watcher already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting SFTP watcher with ${SFTP_POLL_INTERVAL}ms interval`);

    // Run immediately
    await this.pollAllBanks();

    // Then schedule periodic runs
    this.intervalHandle = setInterval(async () => {
      if (this.isRunning) {
        await this.pollAllBanks();
      }
    }, SFTP_POLL_INTERVAL);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    console.log('SFTP watcher stopped');
  }

  private async pollAllBanks(): Promise<void> {
    try {
      const configs = await loadBankConfigs();
      console.log(`Polling ${configs.length} banks...`);

      for (const config of configs) {
        try {
          await this.pollBank(config);
        } catch (error) {
          console.error(`Error polling bank ${config.bank}:`, error);
          await this.recordAlert(config.bank, 'VALIDATION_FAILED', 'ERROR', 
            `Failed to poll bank: ${error}`);
        }
      }
    } catch (error) {
      console.error('Error in poll cycle:', error);
    }
  }

  private async pollBank(config: BankIngestConfig): Promise<void> {
    const now = new Date();
    const windows = this.getCurrentWindows(config, now);
    
    if (windows.length === 0) {
      console.log(`No active windows for ${config.bank}`);
      return;
    }

    console.log(`Polling ${config.bank} for windows:`, windows.map(w => 
      `${format(w.start, 'HH:mm')}-${format(w.end, 'HH:mm')}`));

    // Connect to SFTP
    const client = process.env.USE_MOCK_SFTP === 'true' 
      ? new MockSftpClient(config.sftp)
      : new SftpClient(config.sftp);

    try {
      await client.connect();
      const remoteFiles = await client.list(config.sftp.path);
      
      // Filter stable files
      const stableFiles = await this.filterStableFiles(client, config, remoteFiles);
      
      // Process each stable file
      for (const file of stableFiles) {
        await this.processFile(client, config, file, windows[0]);
      }

      // Check window completion and update health
      for (const window of windows) {
        await this.checkWindowCompletion(config, window);
      }

      await this.updateConnectorHealth(config.bank);

    } finally {
      await client.disconnect();
    }
  }

  private getCurrentWindows(config: BankIngestConfig, now: Date): Array<{start: Date, end: Date}> {
    const windows: Array<{start: Date, end: Date}> = [];
    const zonedNow = utcToZonedTime(now, config.timezone);
    
    for (const cutoff of config.cutoffs) {
      const [hours, minutes] = cutoff.split(':').map(Number);
      const cutoffTime = new Date(zonedNow);
      cutoffTime.setHours(hours, minutes, 0, 0);
      
      const windowEnd = addMinutes(cutoffTime, config.grace_minutes);
      const windowStart = windows.length > 0 
        ? windows[windows.length - 1].end 
        : new Date(cutoffTime.getTime() - 24 * 3600000); // Previous day's last cutoff
      
      // Check if we're in this window or grace period
      if (isAfter(zonedNow, windowStart) && isBefore(zonedNow, windowEnd)) {
        windows.push({
          start: zonedTimeToUtc(windowStart, config.timezone),
          end: zonedTimeToUtc(windowEnd, config.timezone)
        });
      }
    }
    
    return windows;
  }

  private async filterStableFiles(
    client: SftpClient, 
    config: BankIngestConfig, 
    files: RemoteFile[]
  ): Promise<RemoteFile[]> {
    const stable: RemoteFile[] = [];
    
    for (const file of files) {
      // Skip directories
      if (file.isDirectory) continue;
      
      // Skip temp files
      const isTemp = config.completion.temp_suffixes?.some(suffix => 
        file.filename.endsWith(suffix)) || false;
      if (isTemp) continue;
      
      // Check if already processed
      const existing = await db.query(
        'SELECT status FROM ingested_files WHERE bank = $1 AND filename = $2',
        [config.bank, file.filename]
      );
      if (existing.rows.length > 0 && existing.rows[0].status !== 'FAILED') {
        continue;
      }
      
      // Check completion markers
      const isComplete = await this.checkFileCompletion(client, config, file);
      if (isComplete) {
        stable.push(file);
      }
    }
    
    return stable;
  }

  private async checkFileCompletion(
    client: SftpClient,
    config: BankIngestConfig,
    file: RemoteFile
  ): Promise<boolean> {
    const method = config.completion.method;
    
    switch (method) {
      case 'marker':
      case 'marker_or_rename':
        if (config.completion.marker_suffix) {
          const markerPath = file.path + config.completion.marker_suffix;
          const markerExists = await client.fileExists(markerPath);
          if (markerExists) return true;
          if (method === 'marker') return false;
        }
        // Fall through to rename check for marker_or_rename
        
      case 'rename':
        // File exists without temp suffix = complete
        const hasTemp = config.completion.temp_suffixes?.some(suffix => 
          file.filename.endsWith(suffix)) || false;
        return !hasTemp;
        
      case 'checksum':
        if (config.completion.checksum_suffix) {
          const checksumPath = file.path + config.completion.checksum_suffix;
          return await client.fileExists(checksumPath);
        }
        return false;
        
      case 'manifest':
        // This requires parsing manifest file - implement later
        return true;
        
      default:
        return true;
    }
  }

  private async processFile(
    client: SftpClient,
    config: BankIngestConfig,
    file: RemoteFile,
    window: {start: Date, end: Date}
  ): Promise<void> {
    console.log(`Processing ${config.bank}/${file.filename}`);
    
    try {
      // Record as SEEN
      await db.query(`
        INSERT INTO ingested_files (
          bank, remote_path, filename, business_date, 
          size_bytes, uploaded_at, seen_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (bank, filename) 
        DO UPDATE SET 
          seen_at = EXCLUDED.seen_at,
          size_bytes = EXCLUDED.size_bytes,
          status = EXCLUDED.status
      `, [
        config.bank, 
        file.path, 
        file.filename,
        this.extractBusinessDate(file.filename, config),
        file.size,
        file.modifyTime,
        new Date(),
        'SEEN'
      ]);

      // Update status to COMPLETE
      await db.query(`
        UPDATE ingested_files 
        SET status = 'COMPLETE', completed_at = $1
        WHERE bank = $2 AND filename = $3
      `, [new Date(), config.bank, file.filename]);

      // Download file
      const localPath = path.join(SFTP_STAGING_DIR, config.bank, file.filename);
      await client.download(file.path, localPath);
      
      // Update status to DOWNLOADED
      await db.query(`
        UPDATE ingested_files 
        SET status = 'DOWNLOADED', downloaded_at = $1
        WHERE bank = $2 AND filename = $3
      `, [new Date(), config.bank, file.filename]);

      // Validate file
      await this.validateFile(config, localPath, file.filename);
      
      // Update status to VALIDATED
      await db.query(`
        UPDATE ingested_files 
        SET status = 'VALIDATED', validated_at = $1
        WHERE bank = $2 AND filename = $3
      `, [new Date(), config.bank, file.filename]);

      // Update expectations
      await this.updateExpectations(config, file, window);

      // Publish event (would integrate with Kafka/event bus)
      await this.publishFileIngested(config.bank, file.filename);

      console.log(`Successfully processed ${config.bank}/${file.filename}`);

    } catch (error) {
      console.error(`Failed to process ${config.bank}/${file.filename}:`, error);
      
      await db.query(`
        UPDATE ingested_files 
        SET status = 'FAILED', fail_reason = $1
        WHERE bank = $2 AND filename = $3
      `, [String(error), config.bank, file.filename]);

      await this.recordAlert(config.bank, 'VALIDATION_FAILED', 'ERROR',
        `Failed to process file ${file.filename}: ${error}`);
    }
  }

  private extractBusinessDate(filename: string, config: BankIngestConfig): Date {
    // Simple date extraction - would need more sophisticated parsing
    const matches = filename.match(/(\d{4})[_-]?(\d{2})[_-]?(\d{2})/);
    if (matches) {
      return new Date(`${matches[1]}-${matches[2]}-${matches[3]}`);
    }
    return new Date();
  }

  private async validateFile(config: BankIngestConfig, localPath: string, filename: string): Promise<void> {
    const stats = fs.statSync(localPath);
    
    // Check minimum size
    if (stats.size < config.validation.min_size_bytes) {
      throw new Error(`File too small: ${stats.size} < ${config.validation.min_size_bytes}`);
    }

    // Check header if required
    if (config.validation.header_required) {
      const content = fs.readFileSync(localPath, 'utf8');
      const lines = content.split('\n');
      if (lines.length === 0 || !lines[0].trim()) {
        throw new Error('Missing required header');
      }
    }

    // Additional validations would go here (PGP, checksum, etc.)
  }

  private async updateExpectations(
    config: BankIngestConfig, 
    file: RemoteFile,
    window: {start: Date, end: Date}
  ): Promise<void> {
    const businessDate = this.extractBusinessDate(file.filename, config);
    const sequence = this.extractSequence(file.filename, config);

    await db.query(`
      INSERT INTO file_expectations (
        bank, window_start, window_end, business_date,
        expected_name, expected_seq, required, received, received_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (bank, business_date, expected_name)
      DO UPDATE SET 
        received = true,
        received_at = $9
    `, [
      config.bank,
      window.start,
      window.end,
      businessDate,
      file.filename,
      sequence,
      true,
      true,
      new Date()
    ]);
  }

  private extractSequence(filename: string, config: BankIngestConfig): number | null {
    if (config.filename.seq_width === 0) return null;
    
    const seqPattern = `_(\\d{${config.filename.seq_width}})\\.[^.]+$`;
    const matches = filename.match(new RegExp(seqPattern));
    return matches ? parseInt(matches[1]) : null;
  }

  private async checkWindowCompletion(
    config: BankIngestConfig,
    window: {start: Date, end: Date}
  ): Promise<void> {
    const now = new Date();
    const windowEndWithGrace = addMinutes(window.end, config.grace_minutes);
    
    if (isAfter(now, windowEndWithGrace)) {
      // Window has expired, check completeness
      const result = await db.query(`
        SELECT 
          COUNT(*) FILTER (WHERE required = true) as expected_count,
          COUNT(*) FILTER (WHERE received = true) as received_count
        FROM file_expectations
        WHERE bank = $1 
          AND window_start = $2 
          AND window_end = $3
      `, [config.bank, window.start, window.end]);

      const { expected_count, received_count } = result.rows[0];
      
      if (received_count < expected_count) {
        const missing = expected_count - received_count;
        await this.recordAlert(config.bank, 'MISSING_FILES', 'WARNING',
          `Window ${format(window.start, 'HH:mm')} missing ${missing} files`);
      }
    }
  }

  private async updateConnectorHealth(bank: string): Promise<void> {
    const result = await db.query(`
      WITH latest_window AS (
        SELECT DISTINCT ON (bank) 
          bank, window_start, window_end
        FROM file_expectations
        WHERE bank = $1
        ORDER BY bank, window_end DESC
        LIMIT 1
      ),
      window_stats AS (
        SELECT 
          e.bank,
          COUNT(*) FILTER (WHERE e.required = true) as expected_count,
          COUNT(*) FILTER (WHERE e.received = true) as received_count,
          MAX(f.validated_at) as last_file_at
        FROM file_expectations e
        LEFT JOIN ingested_files f ON f.bank = e.bank AND f.status = 'VALIDATED'
        WHERE e.bank = $1
          AND e.window_start = (SELECT window_start FROM latest_window)
        GROUP BY e.bank
      )
      INSERT INTO connector_health (
        bank, last_file_at, expected_count, received_count, 
        lag_minutes, window_status, message, updated_at
      )
      SELECT 
        bank,
        last_file_at,
        expected_count,
        received_count,
        EXTRACT(EPOCH FROM (now() - COALESCE(last_file_at, now() - interval '1 day')))::int / 60,
        CASE
          WHEN received_count = expected_count THEN 'HEALTHY'
          WHEN received_count > 0 THEN 'DEGRADED'
          WHEN EXTRACT(EPOCH FROM (now() - COALESCE(last_file_at, now() - interval '1 day')))::int / 60 > $2 THEN 'DOWN'
          ELSE 'DEGRADED'
        END,
        CASE
          WHEN received_count = expected_count THEN 'All files received'
          WHEN received_count > 0 THEN format('Missing %s files', expected_count - received_count)
          ELSE 'No files received'
        END,
        now()
      FROM window_stats
      ON CONFLICT (bank) DO UPDATE SET
        last_file_at = EXCLUDED.last_file_at,
        expected_count = EXCLUDED.expected_count,
        received_count = EXCLUDED.received_count,
        lag_minutes = EXCLUDED.lag_minutes,
        window_status = EXCLUDED.window_status,
        message = EXCLUDED.message,
        updated_at = EXCLUDED.updated_at
    `, [bank, HEALTH_LAG_THRESHOLD_MINUTES]);
  }

  private async recordAlert(
    bank: string, 
    alertType: string, 
    severity: string, 
    message: string,
    details: any = null
  ): Promise<void> {
    await db.query(`
      INSERT INTO ingest_alerts (bank, alert_type, severity, message, details)
      VALUES ($1, $2, $3, $4, $5)
    `, [bank, alertType, severity, message, JSON.stringify(details)]);
  }

  private async publishFileIngested(bank: string, filename: string): Promise<void> {
    // This would publish to Kafka/event bus
    console.log(`Event published: file_ingested {bank: ${bank}, file: ${filename}}`);
  }
}

// Export singleton instance
export const watcher = new IngestWatcher();