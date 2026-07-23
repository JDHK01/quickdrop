const { createApp } = require("./app");
const { loadConfig } = require("./config");

async function main() {
  const config = loadConfig();
  const app = await createApp(config);
  const server = app.listen(config.port, config.host, () => {
    console.log(`QuickDrop listening on ${config.host}:${config.port}`);
  });

  function shutdown(signal) {
    console.log(`${signal} received, shutting down`);
    server.close((error) => {
      if (error) {
        console.error("Graceful shutdown failed", error);
        process.exitCode = 1;
      }
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("QuickDrop failed to start", error);
  process.exitCode = 1;
});
