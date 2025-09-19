import type {
  ReportSchedule,
  ReportType,
  ReportFormat,
  ReportFilters,
  DeliveryMethod
} from '@/types/reports'
import { reportExportService } from './report-export'
import { v4 as uuidv4 } from 'uuid'

export class ReportSchedulerService {
  private schedules: Map<string, ReportSchedule> = new Map()
  private intervals: Map<string, NodeJS.Timeout> = new Map()
  private running: boolean = false

  // Start scheduler
  start() {
    if (this.running) return
    this.running = true
    console.log('Report scheduler started')
    
    // Check for scheduled reports every minute
    setInterval(() => this.checkScheduledReports(), 60000)
    
    // Load existing schedules (mock)
    this.loadSchedules()
  }

  // Stop scheduler
  stop() {
    this.running = false
    this.intervals.forEach(interval => clearInterval(interval))
    this.intervals.clear()
    console.log('Report scheduler stopped')
  }

  // Load schedules from database (mock)
  private loadSchedules() {
    // Mock schedules for demo
    const mockSchedules: ReportSchedule[] = [
      {
        id: uuidv4(),
        type: 'BANK_MIS',
        filters: { cycleDate: new Date().toISOString().split('T')[0] },
        cadenceCron: '0 19 * * *', // 7 PM daily
        timezone: 'Asia/Kolkata',
        format: 'CSV',
        delivery: 'EMAIL',
        recipients: ['ops@settlepaisa.com'],
        isEnabled: true,
        createdBy: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        type: 'SETTLEMENT_SUMMARY',
        filters: {},
        cadenceCron: '0 9 * * 1', // 9 AM every Monday
        timezone: 'Asia/Kolkata',
        format: 'XLSX',
        delivery: 'S3',
        s3Prefix: 'weekly-reports/',
        recipients: [],
        isEnabled: true,
        createdBy: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]
    
    mockSchedules.forEach(schedule => {
      this.schedules.set(schedule.id, schedule)
    })
  }

  // Parse cron expression to next run time (simplified)
  private getNextRunTime(cronExpr: string, timezone: string): Date {
    // Simplified cron parsing - in production use node-cron or similar
    const parts = cronExpr.split(' ')
    const hour = parseInt(parts[1]) || 0
    const minute = parseInt(parts[0]) || 0
    
    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setHours(hour, minute, 0, 0)
    
    // If time has passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1)
    }
    
    return nextRun
  }

  // Check and run scheduled reports
  private async checkScheduledReports() {
    if (!this.running) return
    
    const now = new Date()
    
    for (const [id, schedule] of this.schedules) {
      if (!schedule.isEnabled) continue
      
      const nextRun = this.getNextRunTime(schedule.cadenceCron, schedule.timezone)
      
      // Check if it's time to run (within 1 minute window)
      if (Math.abs(nextRun.getTime() - now.getTime()) < 60000) {
        await this.runScheduledReport(schedule)
      }
    }
  }

  // Run a scheduled report
  private async runScheduledReport(schedule: ReportSchedule) {
    console.log(`Running scheduled report: ${schedule.type}`)
    
    try {
      // Update status
      schedule.lastRunAt = new Date().toISOString()
      schedule.lastRunStatus = 'RUNNING'
      
      // Generate and export report
      const exportResult = await reportExportService.exportReport(
        schedule.type,
        schedule.filters,
        schedule.format
      )
      
      // Handle delivery
      if (schedule.delivery === 'EMAIL' || schedule.delivery === 'BOTH') {
        await this.sendEmail(schedule, exportResult.signedUrl)
      }
      
      if (schedule.delivery === 'S3' || schedule.delivery === 'BOTH') {
        await this.uploadToS3(schedule, exportResult.signedUrl)
      }
      
      // Update status
      schedule.lastRunStatus = 'SUCCESS'
      schedule.nextRunAt = this.getNextRunTime(schedule.cadenceCron, schedule.timezone).toISOString()
      
      console.log(`Scheduled report completed: ${schedule.type}`)
    } catch (error) {
      console.error(`Scheduled report failed: ${schedule.type}`, error)
      schedule.lastRunStatus = 'FAILED'
      
      // Create exception entry (in production)
      // await createException('REPORT_DELIVERY_FAILED', error)
    }
  }

  // Send email with report link (mock)
  private async sendEmail(schedule: ReportSchedule, signedUrl: string) {
    console.log(`Sending email to: ${schedule.recipients.join(', ')}`)
    console.log(`Report URL: ${signedUrl}`)
    
    // In production, use email service (SendGrid, SES, etc.)
    // For local dev, could use Mailhog
  }

  // Upload to S3 (mock)
  private async uploadToS3(schedule: ReportSchedule, signedUrl: string) {
    const s3Path = `${schedule.s3Prefix || ''}${schedule.type}_${new Date().toISOString()}.${schedule.format.toLowerCase()}`
    console.log(`Uploading to S3: ${s3Path}`)
    
    // In production, copy file to specified S3 prefix
  }

  // Public methods for managing schedules
  
  // Create new schedule
  async createSchedule(schedule: Omit<ReportSchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ReportSchedule> {
    const newSchedule: ReportSchedule = {
      ...schedule,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nextRunAt: this.getNextRunTime(schedule.cadenceCron, schedule.timezone).toISOString()
    }
    
    this.schedules.set(newSchedule.id, newSchedule)
    return newSchedule
  }

  // Update schedule
  async updateSchedule(id: string, updates: Partial<ReportSchedule>): Promise<ReportSchedule | null> {
    const schedule = this.schedules.get(id)
    if (!schedule) return null
    
    const updatedSchedule = {
      ...schedule,
      ...updates,
      updatedAt: new Date().toISOString()
    }
    
    if (updates.cadenceCron || updates.timezone) {
      updatedSchedule.nextRunAt = this.getNextRunTime(
        updatedSchedule.cadenceCron,
        updatedSchedule.timezone
      ).toISOString()
    }
    
    this.schedules.set(id, updatedSchedule)
    return updatedSchedule
  }

  // Delete schedule
  async deleteSchedule(id: string): Promise<boolean> {
    return this.schedules.delete(id)
  }

  // Get all schedules
  getSchedules(): ReportSchedule[] {
    return Array.from(this.schedules.values())
  }

  // Get schedule by ID
  getSchedule(id: string): ReportSchedule | undefined {
    return this.schedules.get(id)
  }

  // Run schedule immediately
  async runScheduleNow(id: string): Promise<void> {
    const schedule = this.schedules.get(id)
    if (!schedule) throw new Error('Schedule not found')
    
    await this.runScheduledReport(schedule)
  }

  // Pause/resume schedule
  async toggleSchedule(id: string, enabled: boolean): Promise<ReportSchedule | null> {
    return this.updateSchedule(id, { isEnabled: enabled })
  }
}

// Singleton instance
export const reportScheduler = new ReportSchedulerService()

// Auto-start scheduler in browser environment
if (typeof window !== 'undefined') {
  setTimeout(() => {
    reportScheduler.start()
  }, 5000)
}