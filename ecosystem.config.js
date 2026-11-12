module.exports = {
  apps: [
    {
      name: "barber-os-web",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      error_file: "./logs/web-error.log",
      out_file: "./logs/web-out.log",
      time: true,
    },
    {
      name: "barber-os-bot",
      script: "whatsapp-server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      restart_delay: 4000,
      error_file: "./logs/bot-error.log",
      out_file: "./logs/bot-out.log",
      time: true,
    },
  ],
};
