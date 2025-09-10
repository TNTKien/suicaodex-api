// pm2.config.js
module.exports = {
  apps: [
    {
      name: "suicaodex_api",
      script: "src/index.ts",
      interpreter: "/root/.bun/bin/bun",   // thay bằng output của `which bun`
      interpreter_args: "run",             // QUAN TRỌNG: dùng "bun run"
      env: {
        NODE_ENV: "production",
        PORT: 3001
      },
      cron_restart: "0 3 * * *",
      out_file: "/tmp/suicaodex_api.out.log",
      error_file: "/tmp/suicaodex_api.err.log",
      time: true
    }
  ]
}
