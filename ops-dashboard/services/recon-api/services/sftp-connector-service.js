const Client = require('ssh2-sftp-client');
const { parseCsvContent, transformBankDataToV2 } = require('./bank-data-transformer');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

async function testSftpConnection(config) {
  const sftp = new Client();
  
  try {
    await sftp.connect({
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey ? Buffer.from(config.privateKey) : undefined,
      readyTimeout: 10000
    });
    
    const list = await sftp.list(config.remotePath || '/');
    
    await sftp.end();
    
    return {
      success: true,
      message: 'SFTP connection successful',
      filesFound: list.length,
      remotePath: config.remotePath
    };
    
  } catch (error) {
    return {
      success: false,
      message: `SFTP connection failed: ${error.message}`,
      error: error.message
    };
  }
}

async function downloadSftpFiles(config, cycleDate, sourceEntity) {
  const sftp = new Client();
  const client = await pool.connect();
  
  try {
    await sftp.connect({
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey ? Buffer.from(config.privateKey) : undefined,
      readyTimeout: 10000
    });
    
    const remotePath = config.remotePath || '/';
    const filePattern = config.filePattern || '*.csv';
    
    const dateStr = cycleDate.replace(/-/g, '');
    const pattern = filePattern.replace('YYYYMMDD', dateStr);
    
    const files = await sftp.list(remotePath);
    const matchingFiles = files.filter(file => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(file.name);
    });
    
    if (matchingFiles.length === 0) {
      await sftp.end();
      return {
        success: false,
        message: `No files found matching pattern: ${pattern}`,
        filesDownloaded: 0
      };
    }
    
    let totalRecords = 0;
    const processedFiles = [];
    
    for (const file of matchingFiles) {
      const remoteFilePath = `${remotePath}/${file.name}`;
      const fileBuffer = await sftp.get(remoteFilePath);
      const content = fileBuffer.toString('utf-8');
      
      const bankData = parseCsvContent(content);
      const v2Data = transformBankDataToV2(bankData, sourceEntity, 'bank_statement');
      
      await client.query('BEGIN');
      
      for (const record of v2Data) {
        await client.query(`
          INSERT INTO sp_v2_bank_transactions (
            transaction_id, utr, amount_paise, transaction_date,
            bank_name, merchant_id, status, source_type, source_name,
            raw_data, ingestion_timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (transaction_id) DO UPDATE SET
            utr = EXCLUDED.utr,
            amount_paise = EXCLUDED.amount_paise,
            updated_at = NOW()
        `, [
          record.transaction_id || `SFTP_${Date.now()}_${Math.random()}`,
          record.utr,
          record.amount_paise,
          record.transaction_date || cycleDate,
          sourceEntity,
          record.merchant_id,
          record.status || 'SETTLED',
          'CONNECTOR',
          sourceEntity,
          JSON.stringify(record)
        ]);
      }
      
      await client.query('COMMIT');
      
      totalRecords += v2Data.length;
      processedFiles.push({
        name: file.name,
        records: v2Data.length
      });
    }
    
    await sftp.end();
    client.release();
    
    return {
      success: true,
      filesDownloaded: matchingFiles.length,
      recordsProcessed: totalRecords,
      files: processedFiles
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    
    return {
      success: false,
      message: `SFTP download failed: ${error.message}`,
      error: error.message
    };
  }
}

module.exports = {
  testSftpConnection,
  downloadSftpFiles
};
