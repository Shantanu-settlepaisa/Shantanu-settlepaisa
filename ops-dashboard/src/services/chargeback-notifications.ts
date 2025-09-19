// OP-0011: Chargeback Notification Service
// Handles notifications and reminders for chargebacks

import type {
  Chargeback,
  ChargebackNotification,
  ChargebackStatus
} from '@/types/chargebacks'

export class ChargebackNotificationService {
  private notifications: Map<string, ChargebackNotification[]> = new Map()
  private notificationId = 1

  constructor() {
    // Initialize with some mock notifications
    this.initializeMockNotifications()
  }

  private initializeMockNotifications() {
    // Create sample notifications for demo
    const now = new Date()
    const notifications: ChargebackNotification[] = [
      {
        type: 'NEW_CHARGEBACK',
        chargebackId: 'cb-1',
        merchantId: 'merchant-1',
        merchantEmail: 'merchant1@example.com',
        caseRef: 'HDFC-CB-2025-001',
        message: 'New chargeback received for ₹5,000.00',
        metadata: {
          amount: 500000,
          reasonCode: '10.4',
          txnId: 'TXN2025010101'
        },
        scheduledAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        sentAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        type: 'EVIDENCE_DUE_SOON',
        chargebackId: 'cb-2',
        merchantId: 'merchant-1',
        merchantEmail: 'merchant1@example.com',
        caseRef: 'HDFC-CB-2025-002',
        message: 'Evidence due in 3 days for chargeback HDFC-CB-2025-002',
        metadata: {
          dueDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          daysRemaining: 3
        },
        scheduledAt: now.toISOString()
      },
      {
        type: 'EVIDENCE_DUE_SOON',
        chargebackId: 'cb-3',
        merchantId: 'merchant-2',
        merchantEmail: 'merchant2@example.com',
        caseRef: 'ICICI-CB-2025-003',
        message: 'Evidence due tomorrow for chargeback ICICI-CB-2025-003',
        metadata: {
          dueDate: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          daysRemaining: 1
        },
        scheduledAt: now.toISOString()
      },
      {
        type: 'EVIDENCE_OVERDUE',
        chargebackId: 'cb-4',
        merchantId: 'merchant-3',
        merchantEmail: 'merchant3@example.com',
        caseRef: 'AXIS-CB-2025-004',
        message: 'Evidence overdue for chargeback AXIS-CB-2025-004',
        metadata: {
          dueDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          daysOverdue: 1
        },
        scheduledAt: new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString(),
        sentAt: new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString()
      },
      {
        type: 'DECISION_RECEIVED',
        chargebackId: 'cb-5',
        merchantId: 'merchant-1',
        merchantEmail: 'merchant1@example.com',
        caseRef: 'HDFC-CB-2025-005',
        message: 'Chargeback HDFC-CB-2025-005 has been WON',
        metadata: {
          outcome: 'WON',
          amountRecovered: 750000
        },
        scheduledAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
        sentAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
      }
    ]

    // Group notifications by merchant
    notifications.forEach(notification => {
      const key = notification.merchantId
      if (!this.notifications.has(key)) {
        this.notifications.set(key, [])
      }
      this.notifications.get(key)!.push(notification)
    })
  }

  // Get pending notifications (not yet sent)
  async getPendingNotifications(): Promise<ChargebackNotification[]> {
    const pending: ChargebackNotification[] = []
    const now = new Date()

    this.notifications.forEach(notifications => {
      notifications.forEach(notification => {
        if (!notification.sentAt && notification.scheduledAt) {
          const scheduledTime = new Date(notification.scheduledAt)
          if (scheduledTime <= now) {
            pending.push(notification)
          }
        }
      })
    })

    return pending
  }

  // Get notifications for a specific chargeback
  async getNotificationsByChargeback(chargebackId: string): Promise<ChargebackNotification[]> {
    const result: ChargebackNotification[] = []
    
    this.notifications.forEach(notifications => {
      notifications.forEach(notification => {
        if (notification.chargebackId === chargebackId) {
          result.push(notification)
        }
      })
    })

    return result.sort((a, b) => {
      const dateA = new Date(a.scheduledAt || a.sentAt || '').getTime()
      const dateB = new Date(b.scheduledAt || b.sentAt || '').getTime()
      return dateB - dateA
    })
  }

  // Get notifications for a specific merchant
  async getNotificationsByMerchant(merchantId: string): Promise<ChargebackNotification[]> {
    return this.notifications.get(merchantId) || []
  }

  // Schedule a new notification
  async scheduleNotification(
    type: ChargebackNotification['type'],
    chargeback: Chargeback,
    scheduledAt: Date,
    metadata?: Record<string, any>
  ): Promise<ChargebackNotification> {
    const notification: ChargebackNotification = {
      type,
      chargebackId: chargeback.id,
      merchantId: chargeback.merchantId,
      merchantEmail: `${chargeback.merchantName.toLowerCase().replace(/\s+/g, '')}@example.com`,
      caseRef: chargeback.caseRef,
      message: this.generateMessage(type, chargeback, metadata),
      metadata,
      scheduledAt: scheduledAt.toISOString()
    }

    const key = chargeback.merchantId
    if (!this.notifications.has(key)) {
      this.notifications.set(key, [])
    }
    this.notifications.get(key)!.push(notification)

    return notification
  }

  // Generate notification message based on type
  private generateMessage(
    type: ChargebackNotification['type'],
    chargeback: Chargeback,
    metadata?: Record<string, any>
  ): string {
    const amount = this.formatCurrency(Number(chargeback.disputedAmountPaise))

    switch (type) {
      case 'NEW_CHARGEBACK':
        return `New chargeback received for ${amount}`
      
      case 'EVIDENCE_DUE_SOON':
        const days = metadata?.daysRemaining || 'N'
        return `Evidence due in ${days} day${days !== 1 ? 's' : ''} for chargeback ${chargeback.caseRef}`
      
      case 'EVIDENCE_OVERDUE':
        return `Evidence overdue for chargeback ${chargeback.caseRef}`
      
      case 'DECISION_RECEIVED':
        const outcome = metadata?.outcome || 'UNKNOWN'
        return `Chargeback ${chargeback.caseRef} has been ${outcome}`
      
      default:
        return `Update for chargeback ${chargeback.caseRef}`
    }
  }

  // Mark notification as sent
  async markAsSent(notification: ChargebackNotification): Promise<void> {
    notification.sentAt = new Date().toISOString()
  }

  // Schedule evidence reminders (T-3 and T-1 days)
  async scheduleEvidenceReminders(chargeback: Chargeback): Promise<void> {
    if (!chargeback.evidenceDueAt) return

    const dueDate = new Date(chargeback.evidenceDueAt)
    const now = new Date()

    // T-3 days reminder
    const t3Date = new Date(dueDate)
    t3Date.setDate(t3Date.getDate() - 3)
    if (t3Date > now) {
      await this.scheduleNotification(
        'EVIDENCE_DUE_SOON',
        chargeback,
        t3Date,
        { dueDate: chargeback.evidenceDueAt, daysRemaining: 3 }
      )
    }

    // T-1 day reminder
    const t1Date = new Date(dueDate)
    t1Date.setDate(t1Date.getDate() - 1)
    if (t1Date > now) {
      await this.scheduleNotification(
        'EVIDENCE_DUE_SOON',
        chargeback,
        t1Date,
        { dueDate: chargeback.evidenceDueAt, daysRemaining: 1 }
      )
    }

    // Overdue notification
    const overdueDate = new Date(dueDate)
    overdueDate.setHours(overdueDate.getHours() + 1)
    await this.scheduleNotification(
      'EVIDENCE_OVERDUE',
      chargeback,
      overdueDate,
      { dueDate: chargeback.evidenceDueAt, daysOverdue: 0 }
    )
  }

  // Send webhook notification
  async sendWebhook(notification: ChargebackNotification, webhookUrl: string): Promise<void> {
    // In production, this would make an actual HTTP request
    console.log('Sending webhook notification:', {
      url: webhookUrl,
      notification
    })

    // Simulate webhook delivery
    await new Promise(resolve => setTimeout(resolve, 100))
    await this.markAsSent(notification)
  }

  // Send email notification
  async sendEmail(notification: ChargebackNotification): Promise<void> {
    // In production, this would use an email service
    console.log('Sending email notification:', {
      to: notification.merchantEmail,
      subject: `Chargeback Alert: ${notification.caseRef}`,
      message: notification.message
    })

    // Simulate email delivery
    await new Promise(resolve => setTimeout(resolve, 100))
    await this.markAsSent(notification)
  }

  // Process pending notifications
  async processPendingNotifications(): Promise<number> {
    const pending = await this.getPendingNotifications()
    let processed = 0

    for (const notification of pending) {
      try {
        // Send via configured channels
        if (notification.merchantEmail) {
          await this.sendEmail(notification)
        }
        
        // Send webhook if configured (mock)
        const webhookUrl = `https://merchant-webhook.example.com/${notification.merchantId}`
        await this.sendWebhook(notification, webhookUrl)
        
        processed++
      } catch (error) {
        console.error('Failed to send notification:', error)
      }
    }

    return processed
  }

  // Get notification statistics
  async getNotificationStats(): Promise<{
    pendingCount: number
    sentToday: number
    sentThisWeek: number
    byType: Record<string, number>
  }> {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - 7)

    let pendingCount = 0
    let sentToday = 0
    let sentThisWeek = 0
    const byType: Record<string, number> = {}

    this.notifications.forEach(notifications => {
      notifications.forEach(notification => {
        // Count by type
        byType[notification.type] = (byType[notification.type] || 0) + 1

        // Count pending
        if (!notification.sentAt) {
          pendingCount++
        } else {
          const sentDate = new Date(notification.sentAt)
          
          // Count sent today
          if (sentDate >= todayStart) {
            sentToday++
          }
          
          // Count sent this week
          if (sentDate >= weekStart) {
            sentThisWeek++
          }
        }
      })
    })

    return {
      pendingCount,
      sentToday,
      sentThisWeek,
      byType
    }
  }

  // Helper to format currency
  private formatCurrency(paise: number): string {
    const rupees = paise / 100
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(rupees)
  }

  // Clear all notifications (for testing)
  clearAll(): void {
    this.notifications.clear()
    this.initializeMockNotifications()
  }
}

// Create singleton instance
export const chargebackNotificationService = new ChargebackNotificationService()