import Mailserver from "./mail-server";

const mailserver = Mailserver();

function shutdown() {
  console.info(`Received shutdown signal, shutting down now...`);
  mailserver.close(() => {
    // on close
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
