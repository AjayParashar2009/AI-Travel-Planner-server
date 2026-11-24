const { BrevoClient } = require("@getbrevo/brevo");

const sendEmail = async (options) => {
  // 1. Initialize the BrevoClient with your API key
  const brevo = new BrevoClient({
    apiKey: process.env.BREVO_API_KEY,
  });

  try {
    // 2. Send the email using the new transactionalEmails method
    const result = await brevo.transactionalEmails.sendTransacEmail({
      subject: options.subject,
      htmlContent: options.html,
      sender: {
        name: "YatraAI Support",
        email: process.env.EMAIL_USER, 
      },
      to: [{ email: options.email }],
    });

    console.log("Email sent successfully via Brevo:", result);
  } catch (error) {
    console.error("Brevo email failed:", error);
    throw error;
  }
};

module.exports = sendEmail;
