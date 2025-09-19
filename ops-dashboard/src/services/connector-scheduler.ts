import { opsApiExtended } from '@/lib/ops-api-extended'
import type { Connector } from '@/types/connectors'

export interface ScheduledJob {
  id: string
  connectorId: string
  cronExpression: string
  nextRun: Date
  lastRun?: Date
  status: 'scheduled' | 'running' | 'completed' | 'failed'
}

class ConnectorScheduler {
  private jobs: Map<string, ScheduledJob> = new Map()
  private intervals: Map<string, NodeJS.Timeout> = new Map()
  private running: boolean = false

  start() {
    if (this.running) return
    this.running = true
    console.log('Connector scheduler started')
    this.loadConnectors()
    // Check for scheduled jobs every minute
    setInterval(() => this.checkScheduledJobs(), 60000)
  }

  stop() {
    this.running = false
    this.intervals.forEach(interval => clearInterval(interval))
    this.intervals.clear()
    this.jobs.clear()
    console.log('Connector scheduler stopped')
  }

  private async loadConnectors() {
    try {
      const response = await opsApiExtended.getConnectors()
      const connectors = response.connectors || []
      
      connectors.forEach((connector: Connector) => {
        if (connector.status === 'ACTIVE' && connector.config) {
          this.scheduleConnector(connector)
        }
      })
    } catch (error) {
      console.error('Failed to load connectors for scheduling:', error)
    }
  }

  private scheduleConnector(connector: Connector) {
    const config = connector.config as any
    if (!config.schedule) return

    const job: ScheduledJob = {
      id: `job_${connector.id}`,
      connectorId: connector.id,
      cronExpression: config.schedule,
      nextRun: this.calculateNextRun(config.schedule, config.timezone),
      status: 'scheduled'
    }

    this.jobs.set(job.id, job)
    console.log(`Scheduled connector ${connector.name} with cron ${config.schedule}`)
  }

  private calculateNextRun(cronExpression: string, timezone: string = 'Asia/Kolkata'): Date {
    // Simple implementation - for production use node-cron or similar
    const now = new Date()
    
    // Parse cron expression (simplified for demo)
    // Format: minute hour day month weekday
    const parts = cronExpression.split(' ')
    const hour = parseInt(parts[1]) || 19 // Default 7 PM
    const minute = parseInt(parts[0]) || 0

    const nextRun = new Date(now)
    nextRun.setHours(hour, minute, 0, 0)

    // If time has passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1)
    }

    return nextRun
  }

  private async checkScheduledJobs() {
    if (!this.running) return

    const now = new Date()
    
    for (const [jobId, job] of this.jobs) {
      if (job.status === 'scheduled' && job.nextRun <= now) {
        await this.runJob(job)
      }
    }
  }

  private async runJob(job: ScheduledJob) {
    console.log(`Running scheduled job ${job.id} for connector ${job.connectorId}`)
    
    job.status = 'running'
    job.lastRun = new Date()

    try {
      // Trigger connector run
      await opsApiExtended.runConnectorNow(job.connectorId)
      
      job.status = 'completed'
      // Calculate next run
      job.nextRun = this.calculateNextRun(job.cronExpression, 'Asia/Kolkata')
      job.status = 'scheduled'
      
      console.log(`Job ${job.id} completed successfully`)
    } catch (error) {
      job.status = 'failed'
      console.error(`Job ${job.id} failed:`, error)
      
      // Retry after 5 minutes
      setTimeout(() => {
        job.status = 'scheduled'
        job.nextRun = new Date(Date.now() + 5 * 60 * 1000)
      }, 5 * 60 * 1000)
    }
  }

  // Public methods for manual control
  async triggerConnector(connectorId: string) {
    const job = Array.from(this.jobs.values()).find(j => j.connectorId === connectorId)
    if (job) {
      await this.runJob(job)
    }
  }

  getJobStatus(connectorId: string): ScheduledJob | undefined {
    return Array.from(this.jobs.values()).find(j => j.connectorId === connectorId)
  }

  getAllJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values())
  }
}

// Singleton instance
export const connectorScheduler = new ConnectorScheduler()

// Auto-start scheduler if in browser environment
if (typeof window !== 'undefined') {
  // Start scheduler after a delay to ensure app is loaded
  setTimeout(() => {
    connectorScheduler.start()
  }, 5000)
}