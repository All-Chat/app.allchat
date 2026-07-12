// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "whatsapp-web",       // Your Next.js App
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      }
    },
    {
      name: "whatsapp-worker",    // Your Background Workers
      script: "npx",
      args: "tsx worker.ts",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
