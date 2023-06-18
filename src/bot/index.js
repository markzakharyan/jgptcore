require('dotenv').config();
const { Client, IntentsBitField, ActivityType } = require('discord.js');
const { Configuration, OpenAIApi } = require('openai');
const db = require('../firestore-helper').db;
const fs = require('fs');
const schedule = require('node-schedule');


function readFileContent(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return fileContent;
  } catch (error) {
    console.error('Error reading file: ', error);
    return null;
  }
}

const prompt = readFileContent('./prompt.txt').trim();


const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildPresences,
    IntentsBitField.Flags.MessageContent,
  ],
});

const configuration = new Configuration({
  apiKey: process.env['OPENAI_API_KEY'],
});
const openai = new OpenAIApi(configuration);

let status = [
  { name: 'my two daughters', type: ActivityType.Watching },
  { name: 'Taylor Swift', type: ActivityType.Listening },
  { name: 'Reading Jane Austen', type: ActivityType.Custom },
];

try {
  client.login(process.env['TOKEN']);
  console.log('JGPT is Online ✔');
} catch (error) {
  console.log(error);
}

client.on('ready', (c) => {
  setInterval(() => {
    let random = Math.floor(Math.random() * status.length);
    client.user.setActivity(status[random]);
  }, 200000);
});


const system_message = {
  role: 'system',
  content: prompt
};


var conversationLog = [

];

const MAX_MESSAGES_PER_DAY = 12;
let currentDailyMessages = 0;

var chunks = [];

const rule = new schedule.RecurrenceRule();
rule.hour = 0;
rule.minute = 0;
rule.tz = 'Etc/UTC';

const job = schedule.scheduleJob(rule, function () {
  console.log('A new day has begun in the UTC timezone!');
});


let quit = false;

let newMessageIds = [];


client.on('messageCreate', async (message) => {

  // if (message.author.bot) return;
  if (message.guildId != process.env['GUILD_ID']) return;
  if (message.channel.id !== process.env['CHANNEL_ID']) return;
  if (message.content.startsWith('!')) return;
  if (message.content.toLowerCase().startsWith("topic") && quit) {
    quit = false;
  }
  //check if not replied to someone
  if (message.reference == null) {
    //if replied to someone, check if replied to self
    if (message.author.id === client.user.id) {
      // if message sent is not a reply and is from the bot, return
      return;
    }
  }
  if (message.content.toLowerCase().startsWith('stop') || message.content.toLowerCase().startsWith('quit')) quit = true;
  if (quit) return;
  try {

    await message.channel.sendTyping();

    conversationLog.push({ role: 'user', content: message.content });

    //if converstationLog length > 6, keep only last 6 elements
    if (conversationLog.length > 6) {
      conversationLog = conversationLog.slice(-6);
    }

    let result = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [system_message, ...conversationLog],
    });
    result = result.data.choices[0].message.content;


    // TO SAVE MY API CREDITS
    //     let result = `Author1: content1

    // Author2: content2

    // Author3: content3

    // Author4: content4`;

    // let result = "Author1: ";
    // for (let i = 0; i < 2100; i++) {
    //   result += "a";
    // }


    conversationLog.push({ role: 'assistant', content: result });

    newMessageIds = [];

    // split result into chunks delimmited by \n and then trim, and then by 2000 characters
    if (chunks.length === 0)
      result.split('\n\n').reduce((acc, content) => acc.concat(content.match(/[\s\S]{1,2000}/g) || []), []);


    currentDailyMessages++;
    const originalChunkLength = chunks.length;

    while (chunks.length > 0) {
      if (chunks.length === originalChunkLength) {
        newMessageIds.push((await message.reply(chunks.shift())).id);

      } else {
        newMessageIds.push((await message.reply(chunks.shift())).id);

        // newMessageIds.push((await message.channel.send(chunks.shift())).id);
      }
    }
    chunks = [];

    await addToDB(result, newMessageIds, message.id);

  } catch (error) {
    console.log(`JGPT encountered an error: ${error}`);
  }
});

async function addToDB(message, ids, prevId) {
  const messagesArray = [];

  message.split("\n").forEach(
    async i => {
      i = i.trim();

      if (i === '') {
        return;
      }

      let thing = i.split(": ");
      let author = thing[0];
      thing.shift();
      let content = thing.join(": ");

      messagesArray.push({
        author, content
      });


    }
  );

const currentDate = new Date().toISOString().split('T')[0]; // e.g. "2023-06-17", so year-month-day

// Ensure the date document exists... unnecessary & extraneous for some reason so commented out
// await db.collection('message_batches').doc(currentDate).set({}, { merge: true });

// Add a new message document to the subcollection within the date document
await db.collection('message_batches').doc(currentDate).collection('messages').add({
    messages: admin.firestore.FieldValue.arrayUnion(...messagesArray),
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    repliedTo: prevId || null,
    ids: ids || null
});

}
