/**
 * Based on
 * https://github.com/maildev/maildev/blob/master/lib/mailserver.js
 * MailDev - mailserver.js
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from "fs";
import { MailParser } from "mailparser-mit";
import { join } from "path";
import { SMTPServer } from "smtp-server";
import { randomBytes } from "crypto";

export function newid(length = 8) {
  return randomBytes(length).toString("hex");
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function clone(object: any) {
  return JSON.parse(JSON.stringify(object));
}

export default function create() {
  const port = Number(process.env.SMTP_PORT || "1025") || 1025;
  const host = process.env.HOST || "0.0.0.0";
  const mailDir = join(process.cwd(), `temp`);

  if (!existsSync(join(mailDir))) {
    mkdirSync(join(mailDir));
  }

  function onError(err: Error & { code?: string; syscall?: string }) {
    if (err.code === "ECONNRESET" && err.syscall === "read") {
      console.warn(
        `Ignoring "${err.message}" error thrown by SMTP server. Likely the client connection closed prematurely. Full error details below.`,
      );
      console.error(err);
    } else throw err;
  }

  const smtp = new SMTPServer({
    onAuth: (auth, _session, callback) => {
      if (auth.username && auth.password) {
        let error: Error | null | undefined;
        if (
          auth.username !== "mail@localhost" ||
          auth.password !== "password"
        ) {
          error = new Error("Invalid username or password");
        }
        return callback(error, { user: { name: auth.username } });
      }
    },
    onData: (
      stream,
      session,
      callback: (e?: Error | null, message?: string | string[]) => any,
    ) => {
      const id = newid();
      const emlStream = createWriteStream(join(mailDir, id + ".eml"));
      emlStream.on("open", function () {
        const parseStream = new MailParser({ streamAttachments: true });
        parseStream.on("end", (email: any) => {
          const emlPath = join(mailDir, id + ".eml");
          const stat = statSync(emlPath);
          // serialize attachments without stream object
          const serializedAttachments =
            email.attachments && email.attachments.length
              ? email.attachments.map((attachment: any) => {
                  const { stream, ...remaining } = attachment;
                  return remaining;
                })
              : null;
          const { attachments, ...parsedEmailRemaining } = email;
          let serialized = clone(parsedEmailRemaining);
          serialized.id = id;
          serialized.time = email.date ? email.date : new Date();
          serialized.read = false;
          serialized.envelope = {
            from: session.envelope.mailFrom,
            to: session.envelope.rcptTo,
            host: session.hostNameAppearsAs,
            remoteAddress: session.remoteAddress,
          };
          serialized.size = stat.size;
          serialized.sizeHuman = formatBytes(stat.size);
          serialized.attachments = serializedAttachments;
          console.log("Saving email: %s, id: %s", email.subject, id);
        });
        parseStream.on(
          "attachment",
          (
            attachment: {
              contentDisposition?: "attachment";
              contentId: string;
              contentType: string; // application/pdf
              fileName: string;
              generatedFileName: string;
              transferEncoding: string; // base64
              stream: import("stream").Stream; //Base64Stream
            },
            _mail: any,
          ) => {
            // if (!existsSync(join(mailDir, id))) { mkdirSync(join(mailDir, id));}
            var output = createWriteStream(
              join(
                mailDir,
                `${id}-${attachment.contentId}-${attachment.fileName}`,
              ),
            );
            attachment.stream.pipe(output);
          },
        );
        stream.pipe(emlStream);
        stream.pipe(parseStream);
        stream.on("end", function () {
          emlStream.end();
          callback(null, `mail-id: ${id}`);
        });
      });
    },
    hideSTARTTLS: true,
    // disabledCommands: user && password ? ["STARTTLS"] : ["AUTH"],
  });
  smtp.on("error", onError);
  smtp.listen(port, host, (err?: Error) => {
    if (err) {
      throw err;
    }
    console.info("SMTP Server running at %s:%s", host, port);
  });
  return smtp;
}
