const express = require('express')
const line = require('@line/bot-sdk');
const path = require("path")
const { pipeline } = require("stream")
const fs = require("fs")
const util = require("util")
const OpenAI = require("openai")
const textmodel = require("./setting");

const { access, constants, mkdir } = require("fs/promises")

// Load .env to environment variable
require('dotenv').config()

const app = express()
const port = process.env.PORT || 3000

const openai = new OpenAI({
  organization: process.env.OPENAI_ORGANIZATION
})

// Read the channel access token and secret from environment variable
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
})

const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.channelAccessToken
})


app.get('/', (req, res) => {
  res.send(`Hi ${req.query.name}!`)
})

app.use('/media', express.static('media'));
app.use('/static', express.static('static'));

app.post('/webhook', line.middleware(config), (req, res) => {
  // req.body.events 可能有很多個
  for (const event of req.body.events) {
    handleEvent(event)
  }

  // 回傳一個 OK 給呼叫的 server，這邊應該是回什麼都可以
  res.send("OK")
})
let messagesdataboy = [
  { "role": "system", "content": textmodel.testmodelboy }
]
let messagesdatagirl = [
  { "role": "system", "content": textmodel.testmodelgirl }
]

const photoKeywords = ['照片', '圖片', '相片'];

function getRandomPhoto(gender) {
    const photoDir = `static/${gender}`;
    if(photoDir){
        const photos = fs.readdirSync(photoDir);
        const randomPhoto = photos[Math.floor(Math.random() * photos.length)];
        return `${process.env.BASE_URL}/${photoDir}/${randomPhoto}`;
    }
    return null
  }

const users = {};

async function handleEvent(event) {
    // Debug 用，把 event 印出來
    //console.log(event)
    const userId = event.source.userId;
  
    if (!userId) {
      console.error('No user ID found in event');
      return;
    }
  
    // 如果这个用户之前没有聊天记录，为其创建一个新的聊天记录数组
    if (!users[userId]) {
      users[userId] = {
        messagesdata: [],
        choose: false,
        gender: null
      };
    }
  
  
    if (event.type === 'message') {
      if (event.message.type === 'text') {
        if (!users[userId].choose) {
          if (event.message.text === "您已選擇和女生聊天") {
            users[userId].messagesdata = messagesdatagirl;
            users[userId].choose = true;
            users[userId].gender = "female";
          } else if (event.message.text === "您已選擇和男生聊天") {
            users[userId].messagesdata = messagesdataboy;
            users[userId].choose = true;
            users[userId].gender = "male";
          }
          if (!users[userId].choose) {
            client.replyMessage({
              replyToken: event.replyToken,
              messages: [{
                type: 'text',
                text: "請選擇您想聊天對象的性別",
                quickReply: {
                  items: [{
                      action: {
                        type: "message",
                        label: "女生",
                        text: "您已選擇和女生聊天"
                      },
                      type: "action"
                    },
                    {
                      action: {
                        type: "message",
                        label: "男生",
                        text: "您已選擇和男生聊天"
                      },
                      type: "action"
                    },
                  ]
                }
              }]
            })
          }
        } else {
          if (event.message.text === "您已離開聊天室") {
            users[userId].messagesdata = [];
            users[userId].choose = false;
            users[userId].gender = null;

          } else {
            users[userId].messagesdata.push({
              "role": "user",
              "content": event.message.text
            });
            const wantsPhoto = photoKeywords.some(keyword => event.message.text.includes(keyword));
            if (wantsPhoto) {
              const photoUrl = getRandomPhoto(users[userId].gender);
              console.log(photoUrl)
              client.replyMessage({
                replyToken: event.replyToken,
                messages: [{
                  type: 'image',
                  originalContentUrl: photoUrl,
                  previewImageUrl: photoUrl
                }]
              });
            } else {
              const completion = await openai.chat.completions.create({
                messages: users[userId].messagesdata,
                model: "gpt-3.5-turbo",
              });
  
              users[userId].messagesdata.push(completion.choices[0].message);
              // quick reply 快速回覆
              client.replyMessage({
                replyToken: event.replyToken,
                messages: [{
                  type: 'text',
                  text: completion.choices[0].message.content,
                  quickReply: {
                    items: [{
                      action: {
                        type: "message",
                        label: "結束聊天(封鎖)",
                        text: "您已離開聊天室"
                      },
                      type: "action"
                    }]
                  }
                }]
              })
            }
          }
        }
      } else if (event.message.type === "image") {
        return;
      }
    }
  }
  
  


app.listen(port, () => {
  console.log(`Sample LINE bot server listening on port ${port}...`)
})