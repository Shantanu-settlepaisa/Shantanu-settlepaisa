module.exports = {
  apps: [{
    name: 'settlement-queue-processor',
    script: './settlement-queue-processor.cjs',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      DB_HOST: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
      DB_PORT: 5432,
      DB_NAME: 'settlepaisa_v2',
      DB_USER: 'postgres',
      DB_PASSWORD: 'SettlePaisa2024'
    },
    error_file: './logs/settlement-queue-error.log',
    out_file: './logs/settlement-queue-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
