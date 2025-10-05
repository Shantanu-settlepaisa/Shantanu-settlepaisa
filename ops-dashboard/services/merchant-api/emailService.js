const nodemailer = require('nodemailer');

// Email service for sending scheduled reports
class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    const smtpConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };

    // If SMTP credentials not configured, use test account for development
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log('⚠️  SMTP credentials not configured. Email service will run in MOCK mode.');
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport(smtpConfig);
  }

  async sendReportEmail({ to, reportName, reportType, csvData, merchant_id }) {
    if (!this.transporter) {
      console.log(`📧 [MOCK EMAIL] Would send ${reportType} report to: ${to.join(', ')}`);
      console.log(`   Report: ${reportName}`);
      console.log(`   Size: ${csvData.length} bytes`);
      return { success: true, mock: true };
    }

    const mailOptions = {
      from: `"SettlePaisa Reports" <${process.env.SMTP_USER}>`,
      to: to.join(', '),
      subject: `${reportName} - ${new Date().toLocaleDateString('en-IN')}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">SettlePaisa Scheduled Report</h2>
          <p>Hello,</p>
          <p>Your scheduled <strong>${reportType}</strong> report is ready.</p>
          
          <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Report Name:</strong> ${reportName}</p>
            <p style="margin: 5px 0;"><strong>Merchant ID:</strong> ${merchant_id}</p>
            <p style="margin: 5px 0;"><strong>Generated At:</strong> ${new Date().toLocaleString('en-IN')}</p>
          </div>

          <p>The report is attached to this email as a CSV file.</p>
          
          <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
            This is an automated email from SettlePaisa. Please do not reply to this email.
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `${reportType.toLowerCase()}_report_${new Date().toISOString().split('T')[0]}.csv`,
          content: csvData,
          contentType: 'text/csv'
        }
      ]
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully to ${to.join(', ')}`);
      console.log(`   Message ID: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      throw error;
    }
  }

  async verifyConnection() {
    if (!this.transporter) {
      return { success: false, message: 'SMTP not configured (MOCK mode)' };
    }

    try {
      await this.transporter.verify();
      console.log('✅ SMTP connection verified');
      return { success: true };
    } catch (error) {
      console.error('❌ SMTP connection failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
const emailService = new EmailService();

module.exports = emailService;
