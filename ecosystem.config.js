module.exports = {
  apps: [
    {
      name: "whatsapp-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3999",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3999
      }
    },
    {
      name: "whatsapp-worker",
      cwd: __dirname,
      script: "npx",
      args: "tsx worker.ts",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
