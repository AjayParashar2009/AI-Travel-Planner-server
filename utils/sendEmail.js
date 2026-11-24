const { Resend } = require("resend");

// Add RESEND_API_KEY to your .env file
const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (options) => {
  try {
    const data = await resend.emails.send({
      from: "YatraAI Support <onboarding@resend.dev>", // Use this for testing
      to: options.email,
      subject: options.subject,
      html: options.html,
    });

    console.log("Email sent successfully via Resend:", data);
    return data;
  } catch (error) {
    console.error("Resend email failed:", error);
    throw error;
  }
};

module.exports = sendEmail;
