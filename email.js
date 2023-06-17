require('dotenv').config();
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const serviceAccount = JSON.parse(process.env['SERVICE_ACCOUNT_JSON']);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

function generateHtml(data) {
  let htmlContent = fs.readFileSync(path.join(__dirname, 'emailTemplate.html'), 'utf8');
  injectedHtml = '';

  data.forEach(item => {
    injectedHtml += `
          <li>
              <h3>${item.author}</h3>
              <p>${item.content}</p>
          </li>
      `;
  });

  htmlContent = htmlContent.replace('{{content}}', injectedHtml);

  return htmlContent;
}




// Function to fetch data from Firestore
async function fetchData() {
  const currentDate = new Date().toISOString().split('T')[0]

  // const snapshot = await db.collection('message_batches').doc(currentDate).collection('messages').orderBy('timestamp').get();
  const snapshot = await db.collection('message_batches').doc("2023-06-16").collection('messages').orderBy('timestamp').get();

  let emailBodyText = '';
  let messageListHTML = [];

  snapshot.forEach(doc => {
    const messages = doc.data()["messages"];
    messages.forEach(message => {
      const author = message.author;
      const content = message.content;
      emailBodyText += `${author} => ${content}\n\n`;
      messageListHTML.push(message);
    });

  });

  let emailTemplate = generateHtml(messageListHTML);

  return { text: emailBodyText, html: emailTemplate };
}

// Function to send email
// async..await is not allowed in global scope, must use a wrapper
async function sendEmail(subject, text, html) {
  let testAccount = await nodemailer.createTestAccount();

  let transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: testAccount.user, // generated ethereal user
      pass: testAccount.pass, // generated ethereal password
    },
  });

  let info = await transporter.sendMail({
    from: '"Weekly Recap 🌟" <recap@example.com>',
    to: "recipient1@example.com, recipient2@example.com",
    subject: subject,
    text: text, // plain text body
    html: html, // html body
  });

  console.log("Message sent: %s", info.messageId);
  console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
}


// Schedule the functions to run every 24 hours
// setInterval(async () => {
//   const emailBody = await fetchData();
//   await sendEmail(emailBody);
// }, 24 * 60 * 60 * 1000);

async function main() {
  const emailBody = await fetchData();
  await sendEmail("subject thingy", emailBody.text, emailBody.html);
}
main();
