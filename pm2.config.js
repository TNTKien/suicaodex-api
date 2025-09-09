module.exports = {
  name: "suicaodex_api", 
  script: "src/index.ts", 
  cron_restart: "0 3 * * *",
  interpreter: "bun", // Bun interpreter
  env: {
    PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`, // Add "~/.bun/bin/bun" to PATH
  },
};
