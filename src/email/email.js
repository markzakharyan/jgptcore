const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const db = require('../firestore-helper').db;


function generateHtml(data) {
  let htmlContent = fs.readFileSync(path.join(__dirname, 'email-template.html'), 'utf8');

  injectedHtml = '';

  data.forEach(item => {
    const date = item.date;
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const messageArray = item.html;
    messageArray.forEach(item => {
      injectedHtml += `
            <li>
                <h3>${item.author}</h3>
                <p>${item.content}</p>
            </li>
        `;
    });
    htmlContent = htmlContent.split(`{{${dayOfWeek}_content}}`).join(injectedHtml);

  });

  console.log(htmlContent);
  return htmlContent;
}




// Function to fetch data from Firestore
async function fetchData(dateArray) {
  // const currentDate = new Date().toISOString().split('T')[0]
  let emailBodyText = '';
  let messageListHTML = [];

  dateArray.forEach(async date => {

    const formattedDate = date.toISOString().split('T')[0];

    const snapshot = await db.collection('message_batches').doc(formattedDate).collection('messages').orderBy('timestamp').get();

    const currentHtml = [];

    emailBodyText += "Date: " + formattedDate + "\n\n";
    snapshot.forEach(doc => {
      const messages = doc.data()["messages"];
      messages.forEach(message => {
        const author = message.author;
        const content = message.content;
        emailBodyText += `${author}: ${content}\n\n`;
        currentHtml.push(message);
      });
    });
    messageListHTML.push({ date: date, html: currentHtml });
    emailBodyText += "\n\n";
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
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayBeforeYesterday = new Date(today);
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

  const dateArray = [today, yesterday, dayBeforeYesterday];
  const emailBody = await fetchData(dateArray);
  // await sendEmail("subject thingy", emailBody.text, emailBody.html);
}
main();
