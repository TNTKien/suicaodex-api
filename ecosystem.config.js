// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "suicaodex_api",
      script: "src/index.ts",
      interpreter: "/usr/local/bin/bun",
      exec_mode: "fork",
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3001
      },
      cron_restart: "0 3 * * *",
      restart_delay: 5000,
      out_file: "/www/wwwlogs/suicaodex_api.out.log",
      error_file: "/www/wwwlogs/suicaodex_api.err.log",
      merge_logs: true,
      time: true
    }
  ]
}
