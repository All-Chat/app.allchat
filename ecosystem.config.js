module.exports = {
  apps: [
    {
      name: "whatsapp-web",
      cwd: __dirname,
      script: "npm",
      args: "run start",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production"
        // If you need a specific port, set it here. 
        // Otherwise, it will automatically use the PORT from your .env file or Next.js default.
        // PORT: 3001 
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
