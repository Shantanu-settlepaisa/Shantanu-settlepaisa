import { opsApiExtended } from '@/lib/ops-api-extended'
import type { Connector, SFTPConfig, IngestedFile } from '@/types/connectors'

export interface SFTPFile {
  name: string
  path: string
  size: number
  modifiedAt: Date
  checksum?: string
}

export interface PollerResult {
  success: boolean
  filesDiscovered: number
  filesDownloaded: number
  filesNormalized: number
  reconTriggered: boolean
  error?: string
}

class SFTPPoller {
  private activePolls: Map<string, boolean> = new Map()

  async pollConnector(connector: Connector): Promise<PollerResult> {
    if (this.activePolls.get(connector.id)) {
      return {
        success: false,
        filesDiscovered: 0,
        filesDownloaded: 0,
        filesNormalized: 0,
        reconTriggered: false,
        error: 'Polling already in progress'
      }
    }

    this.activePolls.set(connector.id, true)

    try {
      const config = connector.config as SFTPConfig
      const cycleDate = this.getCycleDate(config.targetCycleRule)
      
      // Step 1: Discover files
      const files = await this.discoverFiles(connector, cycleDate)
      
      // Step 2: Download files
      const downloadedFiles = await this.downloadFiles(connector, files)
      
      // Step 3: Validate checksums
      const validatedFiles = await this.validateFiles(downloadedFiles)
      
      // Step 4: Normalize data
      const normalizedFiles = await this.normalizeFiles(connector, validatedFiles)
      
      // Step 5: Trigger reconciliation if both files present
      const reconTriggered = await this.triggerReconciliation(connector, normalizedFiles, cycleDate)

      return {
        success: true,
        filesDiscovered: files.length,
        filesDownloaded: downloadedFiles.length,
        filesNormalized: normalizedFiles.length,
        reconTriggered
      }
    } catch (error) {
      console.error(`Polling failed for connector ${connector.name}:`, error)
      return {
        success: false,
        filesDiscovered: 0,
        filesDownloaded: 0,
        filesNormalized: 0,
        reconTriggered: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      this.activePolls.delete(connector.id)
    }
  }

  private getCycleDate(targetCycleRule: string): string {
    const now = new Date()
    
    if (targetCycleRule === 'yesterday') {
      now.setDate(now.getDate() - 1)
    } else if (targetCycleRule === 'custom') {
      // Custom logic here
    }
    
    return now.toISOString().split('T')[0].replace(/-/g, '')
  }

  private async discoverFiles(connector: Connector, cycleDate: string): Promise<SFTPFile[]> {
    const config = connector.config as SFTPConfig
    
    // Mock SFTP file discovery
    // In production, use ssh2-sftp-client or similar
    const filePattern = config.filePattern.replace('YYYYMMDD', cycleDate)
    
    // Simulate finding files
    const mockFiles: SFTPFile[] = [
      {
        name: filePattern.replace('*', ''),
        path: `${config.remotePath}/${filePattern.replace('*', '')}`,
        size: Math.floor(Math.random() * 1000000),
        modifiedAt: new Date()
      }
    ]

    // Check for checksum file
    if (config.checksumExt) {
      mockFiles.push({
        name: `${filePattern.replace('*', '')}${config.checksumExt}`,
        path: `${config.remotePath}/${filePattern.replace('*', '')}${config.checksumExt}`,
        size: 64,
        modifiedAt: new Date()
      })
    }

    console.log(`Discovered ${mockFiles.length} files for ${connector.name}`)
    return mockFiles
  }

  private async downloadFiles(connector: Connector, files: SFTPFile[]): Promise<IngestedFile[]> {
    const downloadedFiles: IngestedFile[] = []
    
    for (const file of files) {
      // Check if file already ingested (dedupe)
      const dedupeKey = `${connector.provider}|${this.getCycleDate('yesterday')}|${file.name}`
      
      // Mock download - in production, actually download via SFTP
      const ingestedFile: IngestedFile = {
        id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        connectorId: connector.id,
        cycleDate: this.getCycleDate('yesterday'),
        remotePath: file.path,
        localUri: `s3://settlepaisa-recon/${connector.provider}/${file.name}`,
        sha256: this.generateMockSHA256(),
        pgpVerified: false,
        fileBytes: file.size,
        dedupeKey,
        state: 'DOWNLOADED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      downloadedFiles.push(ingestedFile)
      console.log(`Downloaded ${file.name} for ${connector.name}`)
    }
    
    return downloadedFiles
  }

  private async validateFiles(files: IngestedFile[]): Promise<IngestedFile[]> {
    const validatedFiles: IngestedFile[] = []
    
    for (const file of files) {
      // Mock checksum validation
      if (file.remotePath.includes('.sha256')) {
        continue // Skip checksum files
      }
      
      // Simulate checksum validation
      const checksumFile = files.find(f => 
        f.remotePath === `${file.remotePath}.sha256`
      )
      
      if (checksumFile) {
        // Mock validation success
        file.state = 'NORMALIZED'
        validatedFiles.push(file)
        console.log(`Validated checksum for ${file.remotePath}`)
      } else {
        // No checksum file, proceed anyway
        file.state = 'NORMALIZED'
        validatedFiles.push(file)
      }
    }
    
    return validatedFiles
  }

  private async normalizeFiles(connector: Connector, files: IngestedFile[]): Promise<IngestedFile[]> {
    const normalizedFiles: IngestedFile[] = []
    
    for (const file of files) {
      if (file.remotePath.includes('.sha256')) {
        continue // Skip checksum files
      }
      
      // Apply mapping template if configured
      if (connector.mappingTemplateId) {
        // Mock normalization
        file.state = 'MATCHED'
        normalizedFiles.push(file)
        console.log(`Normalized ${file.remotePath} using template ${connector.mappingTemplateId}`)
      } else {
        // No template, use as-is
        file.state = 'MATCHED'
        normalizedFiles.push(file)
      }
    }
    
    return normalizedFiles
  }

  private async triggerReconciliation(
    connector: Connector, 
    files: IngestedFile[], 
    cycleDate: string
  ): Promise<boolean> {
    // Check if we have both PG and Bank files for the same cycle
    const hasBankFile = files.some(f => 
      f.connectorId === connector.id && 
      f.cycleDate === cycleDate
    )
    
    if (hasBankFile) {
      // Check for corresponding PG file
      // In production, query database for matching PG file
      const hasPGFile = Math.random() > 0.3 // 70% chance of having PG file
      
      if (hasPGFile) {
        // Trigger reconciliation
        console.log(`Triggering auto-reconciliation for ${connector.name} cycle ${cycleDate}`)
        
        // Create recon job
        try {
          await opsApiExtended.createReconJob({
            merchantId: connector.merchantId || 'MERCH001',
            acquirer: connector.provider,
            cycleDate: cycleDate,
            autoTriggered: true
          })
          
          return true
        } catch (error) {
          console.error('Failed to trigger reconciliation:', error)
        }
      } else {
        console.log(`Waiting for PG file to trigger reconciliation for ${cycleDate}`)
      }
    }
    
    return false
  }

  private generateMockSHA256(): string {
    return Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('')
  }

  // Backfill functionality
  async backfillDateRange(
    connector: Connector, 
    startDate: string, 
    endDate: string,
    force: boolean = false
  ): Promise<{ success: boolean; daysProcessed: number }> {
    const start = new Date(startDate)
    const end = new Date(endDate)
    let daysProcessed = 0
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const cycleDate = date.toISOString().split('T')[0].replace(/-/g, '')
      
      // Temporarily modify connector config
      const originalConfig = connector.config as SFTPConfig
      const tempConnector = {
        ...connector,
        config: {
          ...originalConfig,
          targetCycleRule: 'custom'
        }
      }
      
      const result = await this.pollConnector(tempConnector)
      if (result.success) {
        daysProcessed++
      }
      
      // Add delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    return {
      success: true,
      daysProcessed
    }
  }
}

// Singleton instance
export const sftpPoller = new SFTPPoller()