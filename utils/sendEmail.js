const brevo = require("@getbrevo/brevo");

const sendEmail = async (options) => {
  // Initialize the API client
  const apiInstance = new brevo.TransactionalEmailsApi();

  // Set the Brevo API key
  apiInstance.setApiKey(
    brevo.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY,
  );

  const sendSmtpEmail = new brevo.SendSmtpEmail();
  sendSmtpEmail.subject = options.subject;
  sendSmtpEmail.htmlContent = options.html;

  // The "from" email MUST be the Gmail address you verified as a sender in Brevo
  sendSmtpEmail.sender = {
    name: "YatraAI Support",
    email: process.env.EMAIL_USER,
  };

  sendSmtpEmail.to = [{ email: options.email }];

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log("Email sent successfully via Brevo");
  } catch (error) {
    console.error("Brevo email failed:", error);
    throw error;
  }
};

module.exports = sendEmail;
