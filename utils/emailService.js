// /utils/emailService.js
import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";

dotenv.config();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Sends an email notification
 * @param {string} to - recipient email
 * @param {string} subject - email subject
 * @param {string} text - plain text content
 * @param {string} html - HTML content (optional)
 */
export const sendEmail = async (to, subject, text, html = null) => {
  try {
    const msg = {
      to,
      from: process.env.NOTIFY_FROM_EMAIL,
      subject,
      text,
      html: html || `<p>${text}</p>`,
    };
    await sgMail.send(msg);
    console.log(`✅ Email sent to ${to}`);
  } catch (err) {
    console.error("❌ Error sending email:", err.message);
  }
};
