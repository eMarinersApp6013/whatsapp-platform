const nodemailer = require('nodemailer');

let _transporter;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return _transporter;
}

/**
 * Send email with optional PDF attachment.
 */
async function sendEmail({ to, subject, html, attachments }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('Gmail not configured, skipping email');
    return null;
  }

  const transporter = getTransporter();
  const result = await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'NavyStore'}" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    attachments,
  });

  console.log(`[Email] Sent to ${to}: ${subject}`);
  return result;
}

module.exports = { sendEmail };
