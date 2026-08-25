module.exports = {
  apps: [
    {
      name: "whatsapp-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3999", 
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" }
    },
    {
      name: "main-worker",
      cwd: __dirname,
      script: "npx",
      args: "tsx workers/mainWorker.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" }
    },
    {
      name: "stats-worker",
      cwd: __dirname,
      script: "npx",
      args: "tsx workers/statsWorker.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" }
    },
    {
      name: "sheet-worker",
      cwd: __dirname,
      script: "npx",
      args: "tsx workers/sheetWorker.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" }
    },
    {
      name: "report-worker",
      cwd: __dirname,
      script: "npx",
      args: "tsx workers/reportWorker.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" }
    }
  ]
};
