module.exports = {
  apps: [
    {
      name: 'exports-api',
      script: './server.cjs',
      cwd: '/home/ec2-user/ops-dashboard/services/exports-api',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'staging',
        PORT: 5113,
        DB_HOST: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
        DB_PORT: 5432,
        DB_NAME: 'settlepaisa_v2',
        DB_USER: 'postgres',
        DB_PASSWORD: 'SettlePaisa2024'
      },
      error_file: './logs/exports-api-error.log',
      out_file: './logs/exports-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
