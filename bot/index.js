const forge = require('node-forge');
const { Bot, session, Keyboard, InlineKeyboard } = require("grammy");
const { hydrateFiles } = require("@grammyjs/files");
const fs = require('fs');
require('dotenv').config();

const bot = new Bot(process.env.TOKEN);
const inlineKeyboard = new Keyboard().webApp(
  "open webapp",
  process.env.URL
);
const askAuthType = new InlineKeyboard().text("Password", "Password").text("Private Key", "Private Key").text("Both", "Both");
const noNeed = new InlineKeyboard().text("Ask every time", "Ask every time")

function initial() {
  return {
    state: 0,
    serverAddress: "",
    serverUsername: "",
    serverPort: "",
    authType: "",
    serverPassword: "",
    serverPrivateKey: "",
    serverPrivateKeyBuffer: ""
  };
}
bot.use(session({ initial }));
bot.api.config.use(hydrateFiles(bot.token));

bot.command("start", (ctx) => {
  ctx.session.state = 0;
  return ctx.reply("Welcome!");
});


bot.command("register", (ctx) => {
  return ctx.reply("open webapp", {
    reply_markup: inlineKeyboard,
  });
});


const sendConnection = async (ctx, address, port, username, auth) => {
  const data = {
    address,
    port,
    username,
    auth
  }
  const dataKeyboard = new InlineKeyboard().url(
    "Connect to Terminal",
    `https://t.me/${process.env.BOT_ID}/${process.env.APP_ID}?startapp=${Buffer.from(JSON.stringify(data)).toString('base64')}`
  );
  return ctx.reply("Connect to Terminal", {
    reply_markup: dataKeyboard
  });
}


bot.command("addserver", (ctx) => {
  ctx.session.state = 1;
  return ctx.reply("Please enter the server address.\n\nExample:\n123.123.123.123\nor\naddress.tld");
});

bot.on('message:text', (ctx) => {
  if (ctx.session.state === 1) {
    ctx.session.serverAddress = ctx.message.text;
    ctx.session.state = 2;
    return ctx.reply("Please enter the server port.\n\nExample:\n22");
  }
  if (ctx.session.state === 2) {
    ctx.session.serverPort = ctx.message.text;
    ctx.session.state = 3;
    return ctx.reply("Please enter the server username.\n\nExample:\nroot");
  }
  if (ctx.session.state === 3) {
    ctx.session.serverUsername = ctx.message.text;
    ctx.session.state = 4;
    return ctx.reply("Please select the type the authentication.", {
      reply_markup: askAuthType,
    });
  }
  if (ctx.session.state === 5 || ctx.session.state === 10) {
    ctx.session.serverPassword = ctx.message.text;
    ctx.session.state = 8;
    sendConnection(ctx, ctx.session.serverAddress, ctx.session.serverPort, ctx.session.serverUsername, {
      type: ctx.session.state === 5 ? "password" : "both",
      password: ctx.session.serverPassword,
      privateKey: ctx.session.serverPrivateKey
    });
  }
})

bot.on('callback_query:data', (ctx) => {
  if (ctx.session.state === 4) {
    ctx.session.authType = ctx.callbackQuery.data;
    if (ctx.callbackQuery.data === "Password") {
      ctx.session.state = 5;
      return ctx.reply("Please enter the server password.\n\nExample:\npassword", {
        reply_markup: noNeed,
      });
    }
    else if (ctx.callbackQuery.data === "Private Key") {
      ctx.session.state = 6;
      return ctx.reply("Please upload the server private key.");
    }
    else if (ctx.callbackQuery.data === "Both") {
      ctx.session.state = 7;
      return ctx.reply("Please upload the server private key.");
    }
  }
  if ((ctx.session.state === 5 || ctx.session.state === 10) && ctx.callbackQuery.data === "Ask every time") {
    if (ctx.session.state === 5) {
      sendConnection(ctx, ctx.session.serverAddress, ctx.session.serverPort, ctx.session.serverUsername, {
        type: "password",
        password: null,
      });
    }
    else if (ctx.session.state === 10) {
      sendConnection(ctx, ctx.session.serverAddress, ctx.session.serverPort, ctx.session.serverUsername, {
        type: "both",
        password: null,
        privateKey: ctx.session.serverPrivateKey
      });
    }
    ctx.session.state = 8;
  }
})

function isPEMFile(filePath) {
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const parsedPEM = forge.pem.decode(fileContents);
    return parsedPEM && parsedPEM.length > 0;
  } catch (error) {
    return false;
  }
}

bot.on('message:document', async (ctx) => {
  if (ctx.session.state === 6 || ctx.session.state === 7) {
    if (ctx.message.document.file_size < 100000) {
      const file = await ctx.getFile();
      const filePath = await file.download()
      if (isPEMFile(filePath)) {
        ctx.session.serverPrivateKey = file.file_path;
        ctx.reply(JSON.stringify(file));
        if (ctx.session.state === 6) {
          ctx.session.state = 8;
          sendConnection(ctx, ctx.session.serverAddress, ctx.session.serverPort, ctx.session.serverUsername, {
            type: "privateKey",
            privateKey: ctx.session.serverPrivateKey
          });
          return ctx.reply("Complete!");
        }
        else if (ctx.session.state === 7) {
          ctx.session.state = 10;
          return ctx.reply("Please enter the server password.\n\nExample:\npassword", {
            reply_markup: noNeed,
          });
        }
      }
      else {
        return ctx.reply("The file you uploaded is not a valid PEM file. Upload a valid PEM file.");
      }
    }

  }
})
bot.on('message:web_app_data', (ctx) => {
  ctx.reply(ctx.message.web_app_data.data);
});

bot.start();
