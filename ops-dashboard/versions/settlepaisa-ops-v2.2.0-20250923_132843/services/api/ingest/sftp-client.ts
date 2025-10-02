import * as ssh2 from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SftpConfig } from './config';

export interface RemoteFile {
  filename: string;
  path: string;
  size: number;
  modifyTime: Date;
  accessTime: Date;
  isDirectory: boolean;
}

export class SftpClient {
  private conn: ssh2.Client;
  private sftp: ssh2.SFTPWrapper | null = null;
  private config: SftpConfig;

  constructor(config: SftpConfig) {
    this.config = config;
    this.conn = new ssh2.Client();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.conn.on('ready', () => {
        this.conn.sftp((err, sftp) => {
          if (err) {
            reject(err);
          } else {
            this.sftp = sftp;
            resolve();
          }
        });
      });

      this.conn.on('error', (err) => {
        reject(err);
      });

      const connectionConfig: any = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.user,
      };

      if (this.config.password) {
        connectionConfig.password = this.config.password;
      } else if (this.config.privateKey) {
        connectionConfig.privateKey = fs.readFileSync(this.config.privateKey);
      }

      this.conn.connect(connectionConfig);
    });
  }

  async disconnect(): Promise<void> {
    if (this.sftp) {
      this.sftp.end();
      this.sftp = null;
    }
    this.conn.end();
  }

  async list(remotePath: string): Promise<RemoteFile[]> {
    if (!this.sftp) throw new Error('Not connected');

    return new Promise((resolve, reject) => {
      this.sftp!.readdir(remotePath, (err, files) => {
        if (err) {
          reject(err);
        } else {
          const remoteFiles: RemoteFile[] = files.map(file => ({
            filename: file.filename,
            path: path.join(remotePath, file.filename),
            size: file.attrs.size || 0,
            modifyTime: new Date((file.attrs.mtime || 0) * 1000),
            accessTime: new Date((file.attrs.atime || 0) * 1000),
            isDirectory: file.attrs.isDirectory(),
          }));
          resolve(remoteFiles);
        }
      });
    });
  }

  async download(remotePath: string, localPath: string, resume: boolean = true): Promise<string> {
    if (!this.sftp) throw new Error('Not connected');

    // Create directory if it doesn't exist
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check if file exists and get size for resume
    let startOffset = 0;
    if (resume && fs.existsSync(localPath)) {
      const stats = fs.statSync(localPath);
      startOffset = stats.size;
    }

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(localPath, {
        flags: resume ? 'a' : 'w',
        start: startOffset
      });

      const readStream = this.sftp!.createReadStream(remotePath, {
        start: startOffset,
        autoClose: true
      });

      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', () => resolve(localPath));

      readStream.pipe(writeStream);
    });
  }

  async getFileSize(remotePath: string): Promise<number> {
    if (!this.sftp) throw new Error('Not connected');

    return new Promise((resolve, reject) => {
      this.sftp!.stat(remotePath, (err, stats) => {
        if (err) {
          reject(err);
        } else {
          resolve(stats.size);
        }
      });
    });
  }

  async fileExists(remotePath: string): Promise<boolean> {
    if (!this.sftp) throw new Error('Not connected');

    return new Promise((resolve) => {
      this.sftp!.stat(remotePath, (err) => {
        resolve(!err);
      });
    });
  }

  async calculateChecksum(localPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(localPath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}

// Mock SFTP client for testing
export class MockSftpClient extends SftpClient {
  private mockFiles: Map<string, RemoteFile[]> = new Map();

  constructor(config: SftpConfig) {
    super(config);
    this.initMockData();
  }

  private initMockData(): void {
    // Add mock files for testing
    const now = new Date();
    this.mockFiles.set('/outbound/settlement', [
      {
        filename: 'AXIS_SETTLE_2025-09-19_01.csv',
        path: '/outbound/settlement/AXIS_SETTLE_2025-09-19_01.csv',
        size: 102400,
        modifyTime: new Date(now.getTime() - 3600000),
        accessTime: now,
        isDirectory: false
      },
      {
        filename: 'AXIS_SETTLE_2025-09-19_01.csv.ok',
        path: '/outbound/settlement/AXIS_SETTLE_2025-09-19_01.csv.ok',
        size: 0,
        modifyTime: new Date(now.getTime() - 3500000),
        accessTime: now,
        isDirectory: false
      },
      {
        filename: 'AXIS_SETTLE_2025-09-19_02.csv.part',
        path: '/outbound/settlement/AXIS_SETTLE_2025-09-19_02.csv.part',
        size: 51200,
        modifyTime: now,
        accessTime: now,
        isDirectory: false
      }
    ]);
  }

  async connect(): Promise<void> {
    // Mock connection
    console.log('Mock SFTP connected');
  }

  async disconnect(): Promise<void> {
    // Mock disconnection
    console.log('Mock SFTP disconnected');
  }

  async list(remotePath: string): Promise<RemoteFile[]> {
    return this.mockFiles.get(remotePath) || [];
  }

  async download(remotePath: string, localPath: string): Promise<string> {
    // Mock download - create a dummy file
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const mockContent = `"Date","Transaction ID","Amount","Status"\n"2025-09-19","TXN001","1000.00","SUCCESS"\n`;
    fs.writeFileSync(localPath, mockContent);
    return localPath;
  }

  async fileExists(remotePath: string): Promise<boolean> {
    const dir = path.dirname(remotePath);
    const filename = path.basename(remotePath);
    const files = this.mockFiles.get(dir) || [];
    return files.some(f => f.filename === filename);
  }

  async getFileSize(remotePath: string): Promise<number> {
    const dir = path.dirname(remotePath);
    const filename = path.basename(remotePath);
    const files = this.mockFiles.get(dir) || [];
    const file = files.find(f => f.filename === filename);
    return file?.size || 0;
  }
}