// lib/http.js — fetch wrapper with JSON + CSV download
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export class HttpClient {
  constructor(baseUrl, downloadDir = 'verification/artifacts') {
    this.baseUrl = baseUrl;
    this.downloadDir = downloadDir;
    this.ensureDownloadDir();
  }

  ensureDownloadDir() {
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
    }

    return response;
  }

  async get(endpoint, headers = {}) {
    const response = await this.request(endpoint, { 
      method: 'GET',
      headers 
    });
    return await response.json();
  }

  async post(endpoint, body, headers = {}) {
    const response = await this.request(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    return await response.json();
  }

  async put(endpoint, body, headers = {}) {
    const response = await this.request(endpoint, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });
    return await response.json();
  }

  async downloadCsv(endpoint, filename = null, headers = {}) {
    const response = await this.request(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv',
        ...headers
      }
    });

    const csvContent = await response.text();
    
    if (filename) {
      const filepath = path.join(this.downloadDir, filename);
      fs.writeFileSync(filepath, csvContent);
      return { content: csvContent, filepath };
    }
    
    return { content: csvContent };
  }

  parseCsv(csvContent) {
    const lines = csvContent.trim().split('\\n');
    if (lines.length === 0) return { headers: [], rows: [] };
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      return row;
    });
    
    return { headers, rows };
  }
}