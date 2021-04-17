/** */
(async function main() {
  try {
    const { createTransport } = await import("nodemailer");
    const path = await import("path");
    const fs = await import("fs");
    var transporter = createTransport({
      host: "localhost",
      port: 1025, // 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: "mail@localhost", // generated ethereal user
        pass: "password", // generated ethereal password
      },
    });

    const filepath = process.argv.slice(2)[0];
    const file = fs.readFileSync(filepath);
    const info = await transporter.sendMail({
      from: "mail@localhost",
      to: "mail@localhost",
      subject: "Hello",
      text: "Hello!",
      attachments: [
        {
          content: file,
          filename: path.basename(filepath),
          contentType: "application/pdf"
        },
      ],
    });

    console.log("Email sent: " + info.response);
  } catch (error) {
    return Promise.reject(error);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
