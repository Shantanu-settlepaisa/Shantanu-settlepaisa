const cron = require('node-cron');
const { Pool } = require('pg');
const emailService = require('./emailService');

const v2Pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

class ReportScheduler {
  constructor() {
    this.cronJob = null;
  }

  start() {
    // Run every minute to check for due scheduled reports
    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.checkAndExecuteScheduledReports();
    });

    console.log('📅 Report scheduler started (checks every minute)');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('📅 Report scheduler stopped');
    }
  }

  async checkAndExecuteScheduledReports() {
    try {
      // Find all scheduled reports that are due
      const { rows: schedules } = await v2Pool.query(`
        SELECT 
          id, schedule_id, merchant_id, report_type, 
          frequency, time_ist, email_recipients,
          last_run_at, next_run_at, is_active
        FROM sp_v2_scheduled_reports
        WHERE is_active = TRUE
          AND next_run_at <= NOW()
        ORDER BY next_run_at ASC
        LIMIT 10
      `);

      if (schedules.length > 0) {
        console.log(`📋 Found ${schedules.length} scheduled report(s) due for execution`);
      }

      for (const schedule of schedules) {
        await this.executeScheduledReport(schedule);
      }
    } catch (error) {
      console.error('❌ Error checking scheduled reports:', error);
    }
  }

  async executeScheduledReport(schedule) {
    const startTime = Date.now();
    console.log(`\n🔄 Executing scheduled report: ${schedule.schedule_id}`);
    console.log(`   Type: ${schedule.report_type}, Merchant: ${schedule.merchant_id}`);

    try {
      // 1. Generate report data
      const { csvData, rowCount } = await this.generateReportData(
        schedule.report_type,
        schedule.merchant_id
      );

      // 2. Save report metadata
      const reportId = await this.saveReportMetadata(schedule, rowCount, csvData.length);

      // 3. Send email
      if (schedule.email_recipients && schedule.email_recipients.length > 0) {
        await emailService.sendReportEmail({
          to: schedule.email_recipients,
          reportName: `${schedule.report_type} Report`,
          reportType: schedule.report_type,
          csvData: csvData,
          merchant_id: schedule.merchant_id
        });
      }

      // 4. Update schedule for next run
      await this.updateNextRunTime(schedule);

      const duration = Date.now() - startTime;
      console.log(`✅ Report execution completed in ${duration}ms`);
      console.log(`   Report ID: ${reportId}, Rows: ${rowCount}`);
    } catch (error) {
      console.error(`❌ Failed to execute scheduled report ${schedule.schedule_id}:`, error);
      // Mark as failed but don't stop the schedule
      await v2Pool.query(`
        UPDATE sp_v2_scheduled_reports
        SET last_error = $1, last_error_at = NOW()
        WHERE id = $2
      `, [error.message, schedule.id]);
    }
  }

  async generateReportData(reportType, merchantId) {
    // Calculate date range (last 30 days by default)
    const toDate = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let query, headers;

    switch (reportType) {
      case 'TRANSACTION':
        headers = ['Transaction_ID', 'Date', 'Amount_INR', 'Status', 'Payment_Method', 'Settlement_ID', 'UTR', 'RRN', 'Bank', 'Gateway_Ref', 'Merchant_Name'];
        query = `
          SELECT
            t.transaction_id,
            TO_CHAR(t.transaction_timestamp, 'YYYY-MM-DD HH24:MI:SS') AS transaction_date,
            t.amount_paise / 100.0 AS amount_inr,
            t.status,
            t.payment_method,
            COALESCE(t.settlement_batch_id::TEXT, 'Pending') AS settlement_id,
            t.utr, t.rrn, t.acquirer_code AS bank,
            t.gateway_ref, t.merchant_name
          FROM sp_v2_transactions t
          WHERE t.merchant_id = $1
            AND DATE(t.transaction_timestamp) BETWEEN $2 AND $3
          ORDER BY t.transaction_timestamp DESC
        `;
        break;

      case 'SETTLEMENT':
        headers = ['Settlement_ID', 'Date', 'Batch_ID', 'Gross_Amount', 'Fees', 'Tax', 'Net_Amount', 'UTR', 'Status'];
        query = `
          SELECT
            sb.settlement_id,
            TO_CHAR(sb.settlement_date, 'YYYY-MM-DD') AS settlement_date,
            sb.batch_id,
            sb.gross_amount_paise / 100.0 AS gross_amount,
            sb.fees_paise / 100.0 AS fees,
            sb.tax_paise / 100.0 AS tax,
            sb.net_amount_paise / 100.0 AS net_amount,
            sb.utr,
            sb.status
          FROM sp_v2_settlement_batches sb
          WHERE sb.merchant_id = $1
            AND DATE(sb.settlement_date) BETWEEN $2 AND $3
          ORDER BY sb.settlement_date DESC
        `;
        break;

      case 'DISPUTE':
        headers = ['Dispute_ID', 'Transaction_ID', 'Amount_INR', 'Reason', 'Status', 'Created_Date', 'Resolution', 'Dispute_Type', 'Card_Network', 'Case_Number', 'Resolution_Date'];
        query = `
          SELECT
            d.dispute_id,
            d.transaction_id,
            d.dispute_amount_paise / 100.0 AS amount_inr,
            d.reason,
            d.status,
            TO_CHAR(d.created_at, 'YYYY-MM-DD') AS created_date,
            d.resolution,
            d.dispute_type,
            d.card_network,
            d.case_number,
            TO_CHAR(d.resolution_date, 'YYYY-MM-DD') AS resolution_date
          FROM sp_v2_disputes d
          WHERE d.merchant_id = $1
            AND DATE(d.created_at) BETWEEN $2 AND $3
          ORDER BY d.created_at DESC
        `;
        break;

      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }

    const { rows } = await v2Pool.query(query, [merchantId, fromDate, toDate]);

    // Format as CSV
    const csvData = this.formatCSV(rows, headers);

    return { csvData, rowCount: rows.length };
  }

  formatCSV(data, headers) {
    const csvHeaders = headers.join(',');
    const csvRows = data.map(row => {
      return headers.map(header => {
        const value = row[header.toLowerCase().replace(/ /g, '_')];
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',');
    });
    return [csvHeaders, ...csvRows].join('\n');
  }

  async saveReportMetadata(schedule, rowCount, fileSize) {
    const reportId = `${schedule.report_type.substring(0, 2).toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    await v2Pool.query(`
      INSERT INTO sp_v2_report_metadata (
        report_id, merchant_id, report_type, report_name, report_description,
        status, row_count, file_size_bytes, date_from, date_to, format,
        generated_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW() + INTERVAL '30 days')
    `, [
      reportId,
      schedule.merchant_id,
      schedule.report_type,
      `${schedule.report_type} Report - ${new Date().toLocaleDateString('en-IN')}`,
      `Scheduled report generated automatically`,
      'READY',
      rowCount,
      fileSize,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      new Date().toISOString().split('T')[0],
      'CSV'
    ]);

    return reportId;
  }

  async updateNextRunTime(schedule) {
    let nextRun;
    const now = new Date();

    switch (schedule.frequency) {
      case 'DAILY':
        nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'WEEKLY':
        nextRun = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'MONTHLY':
        nextRun = new Date(now);
        nextRun.setMonth(nextRun.getMonth() + 1);
        break;
      default:
        nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }

    await v2Pool.query(`
      UPDATE sp_v2_scheduled_reports
      SET last_run_at = NOW(),
          next_run_at = $1,
          last_error = NULL,
          last_error_at = NULL
      WHERE id = $2
    `, [nextRun, schedule.id]);
  }
}

const reportScheduler = new ReportScheduler();

module.exports = reportScheduler;
