module.exports = {
  apps: [
    {
      name: "wp-site-monitor",
      script: "server/index.js",
      autorestart: true,
      watch: false,
    },
  ],
};
