export default {
  apps: [
    {
      name: "wp-site-monitor",
      script: "src/index.js",
      autorestart: true,
      watch: false,
    },
  ],
};
