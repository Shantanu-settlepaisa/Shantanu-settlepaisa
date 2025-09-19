// Auto-generated seed data
// Generated at: 2025-09-10T07:31:58.444Z

export const SEED_CONNECTORS = [
  {
    "sourceId": "hdfc_bank_sftp",
    "name": "HDFC Bank SFTP",
    "type": "BANK_SFTP",
    "acquirerCode": "HDFC",
    "pathOrEndpoint": "/upload",
    "fileGlob": "hdfc_*.csv",
    "timezone": "Asia/Kolkata",
    "isEnabled": true,
    "credentials": {
      "host": "localhost",
      "port": 2222,
      "username": "hdfc",
      "password": "hdfc123"
    },
    "schedule": {
      "cronExpr": "0 0 19 * * ?",
      "description": "Daily at 7:00 PM IST"
    },
    "health": {
      "status": "healthy",
      "latency": 120,
      "lastCheck": "2025-09-10T13:30:00Z"
    },
    "lastJob": {
      "cycleDate": "2025-09-09",
      "status": "SUCCEEDED",
      "rowsIngested": 1250,
      "bytesIngested": 125000
    }
  },
  {
    "sourceId": "icici_bank_sftp",
    "name": "ICICI Bank SFTP",
    "type": "BANK_SFTP",
    "acquirerCode": "ICICI",
    "pathOrEndpoint": "/upload",
    "fileGlob": "icici_*.csv",
    "timezone": "Asia/Kolkata",
    "isEnabled": true,
    "credentials": {
      "host": "localhost",
      "port": 2222,
      "username": "icici",
      "password": "icici123"
    },
    "schedule": {
      "cronExpr": "0 30 19 * * ?",
      "description": "Daily at 7:30 PM IST"
    },
    "health": {
      "status": "healthy",
      "latency": 95,
      "lastCheck": "2025-09-10T13:30:00Z"
    },
    "lastJob": {
      "cycleDate": "2025-09-09",
      "status": "SUCCEEDED",
      "rowsIngested": 2150,
      "bytesIngested": 215000
    }
  },
  {
    "sourceId": "axis_bank_sftp",
    "name": "AXIS Bank SFTP",
    "type": "BANK_SFTP",
    "acquirerCode": "AXIS",
    "pathOrEndpoint": "/upload",
    "fileGlob": "axis_*.csv",
    "timezone": "Asia/Kolkata",
    "isEnabled": true,
    "credentials": {
      "host": "localhost",
      "port": 2222,
      "username": "axis",
      "password": "axis123"
    },
    "schedule": {
      "cronExpr": "0 0 20 * * ?",
      "description": "Daily at 8:00 PM IST"
    },
    "health": {
      "status": "degraded",
      "latency": 450,
      "lastCheck": "2025-09-10T13:30:00Z",
      "message": "High latency detected"
    },
    "lastJob": {
      "cycleDate": "2025-09-09",
      "status": "SUCCEEDED",
      "rowsIngested": 890,
      "bytesIngested": 89000
    }
  },
  {
    "sourceId": "razorpay_api",
    "name": "Razorpay API",
    "type": "PG_HTTP_API",
    "merchantId": "MERCH001",
    "pathOrEndpoint": "https://api.razorpay.com/v1/payments",
    "httpMethod": "GET",
    "headersJson": {
      "Authorization": "Basic cnpwX3Rlc3RfYWJjZGVmZ2hpams="
    },
    "timezone": "Asia/Kolkata",
    "isEnabled": true,
    "credentials": {
      "apiKey": "rzp_test_abcdefghijk",
      "apiSecret": "***************"
    },
    "schedule": {
      "cronExpr": "0 */30 * * * ?",
      "description": "Every 30 minutes"
    },
    "health": {
      "status": "healthy",
      "latency": 180,
      "lastCheck": "2025-09-10T13:30:00Z"
    },
    "lastJob": {
      "cycleDate": "2025-09-10",
      "status": "RUNNING",
      "rowsIngested": 0,
      "bytesIngested": 0
    }
  },
  {
    "sourceId": "paytm_db",
    "name": "Paytm Database",
    "type": "PG_DB_PULL",
    "merchantId": "MERCH002",
    "pathOrEndpoint": "jdbc:postgresql://pg-replica.paytm.local:5432/transactions",
    "timezone": "Asia/Kolkata",
    "isEnabled": false,
    "credentials": {
      "connectionString": "postgresql://readonly:pass@pg-replica.paytm.local:5432/transactions"
    },
    "schedule": {
      "cronExpr": "0 0 */6 * * ?",
      "description": "Every 6 hours",
      "isPaused": true
    },
    "health": {
      "status": "down",
      "lastCheck": "2025-09-10T13:30:00Z",
      "message": "Connection refused"
    },
    "lastJob": {
      "cycleDate": "2025-09-08",
      "status": "FAILED",
      "errorMessage": "Connection timeout after 30s"
    }
  },
  {
    "sourceId": "phonepe_api",
    "name": "PhonePe API",
    "type": "PG_HTTP_API",
    "merchantId": "MERCH003",
    "pathOrEndpoint": "https://api.phonepe.com/v4/transactions/search",
    "httpMethod": "POST",
    "headersJson": {
      "Content-Type": "application/json",
      "X-MERCHANT-ID": "MERCH003",
      "X-API-KEY": "phonepe_prod_key_xyz"
    },
    "timezone": "Asia/Kolkata",
    "isEnabled": true,
    "credentials": {
      "apiKey": "phonepe_prod_key_xyz",
      "apiSecret": "***************"
    },
    "schedule": {
      "cronExpr": "0 15 * * * ?",
      "description": "Every hour at 15 minutes"
    },
    "health": {
      "status": "healthy",
      "latency": 220,
      "lastCheck": "2025-09-10T13:30:00Z"
    },
    "lastJob": {
      "cycleDate": "2025-09-10",
      "status": "QUEUED"
    }
  }
]

export const SEED_JOBS = [
  {
    "jobId": "job_001",
    "sourceId": "hdfc_bank_sftp",
    "cycleDate": "2025-09-09",
    "status": "SUCCEEDED",
    "attempt": 1,
    "rowsIngested": 1250,
    "bytesIngested": 125000,
    "createdAt": "2025-09-09T19:00:00Z",
    "completedAt": "2025-09-09T19:02:35Z",
    "events": [
      {
        "kind": "CONNECT",
        "payload": {
          "host": "localhost",
          "port": 2222
        },
        "createdAt": "2025-09-09T19:00:00Z"
      },
      {
        "kind": "LIST",
        "payload": {
          "files": [
            "hdfc_2025-09-09.csv"
          ]
        },
        "createdAt": "2025-09-09T19:00:05Z"
      },
      {
        "kind": "DOWNLOAD",
        "payload": {
          "file": "hdfc_2025-09-09.csv",
          "size": 125000
        },
        "createdAt": "2025-09-09T19:00:10Z"
      },
      {
        "kind": "VERIFY",
        "payload": {
          "checksum": "abc123def456",
          "valid": true
        },
        "createdAt": "2025-09-09T19:01:00Z"
      },
      {
        "kind": "UPLOAD_RAW",
        "payload": {
          "s3Path": "s3://ops-raw/hdfc/2025-09-09/hdfc_2025-09-09.csv"
        },
        "createdAt": "2025-09-09T19:02:00Z"
      },
      {
        "kind": "COMPLETE",
        "payload": {
          "rows": 1250,
          "duration": "2m 35s"
        },
        "createdAt": "2025-09-09T19:02:35Z"
      }
    ]
  },
  {
    "jobId": "job_002",
    "sourceId": "razorpay_api",
    "cycleDate": "2025-09-10",
    "status": "RUNNING",
    "attempt": 1,
    "createdAt": "2025-09-10T13:30:00Z",
    "events": [
      {
        "kind": "CONNECT",
        "payload": {
          "endpoint": "https://api.razorpay.com/v1/payments"
        },
        "createdAt": "2025-09-10T13:30:00Z"
      }
    ]
  },
  {
    "jobId": "job_003",
    "sourceId": "paytm_db",
    "cycleDate": "2025-09-08",
    "status": "FAILED",
    "attempt": 3,
    "maxAttempt": 3,
    "errorMessage": "Connection timeout after 30s",
    "createdAt": "2025-09-08T12:00:00Z",
    "events": [
      {
        "kind": "CONNECT",
        "payload": {
          "connectionString": "postgresql://pg-replica.paytm.local:5432"
        },
        "createdAt": "2025-09-08T12:00:00Z"
      },
      {
        "kind": "ERROR",
        "payload": {
          "error": "Connection timeout after 30s",
          "attempt": 3
        },
        "createdAt": "2025-09-08T12:00:30Z"
      }
    ]
  }
]
