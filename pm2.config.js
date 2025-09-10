// pm2.config.js
module.exports = {
  apps: [{
    name: "suicaodex_api",
    script: "src/index.ts",
    interpreter: "/root/.bun/bin/bun", // chỉnh theo `which bun`
    interpreter_args: "run",
    env: { PORT: 3001, NODE_ENV: "production" },
    cron_restart: "0 3 * * *",
    time: true
  }]
}
