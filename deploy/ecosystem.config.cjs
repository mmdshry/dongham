module.exports = {
  apps: [
    {
      name: 'dongham-api',
      cwd: '/home/dongham/public_html',
      script: './deploy/start-prod.sh',
      interpreter: 'bash',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '8787',
        HOST: '127.0.0.1',
        CORS_ORIGIN: 'https://app.dongham.ir,https://dongham.ir,https://www.dongham.ir,https://admin.dongham.ir',
        APP_PUBLIC_URL: 'https://app.dongham.ir',
        // MYSQL_* must live in /home/dongham/public_html/.env
      },
    },
  ],
};
