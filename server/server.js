import { WebSocketServer } from "ws";
import http from "http";
import cors from "cors";
import express from "express";
import bodyParser from "body-parser";
import { NodeSSH } from "node-ssh";
import fs from "fs";
import { fileURLToPath } from 'url';
import path from 'path';
import forge from "node-forge";
import { Bot, session, InputFile, InlineKeyboard } from "grammy";
import { hydrateFiles } from "@grammyjs/files";
import crypto from 'crypto';
import dotenv from "dotenv";
dotenv.config();



const main = () => {
    const bot = new Bot(process.env.TOKEN);
    const inlineKeyboard = new InlineKeyboard().webApp(
        "Add Server",
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
        return ctx.reply("I can help you connect to your servers by SSH connection directly in Telegram using a fancy mini-app UI.\n\nYou can connect by these two ways:\n\n/addserver - Bind a server to your Telegram account\n/shortcut - Create a shortcut to connect instantly and share to others.");
    });


    bot.command("addserver", (ctx) => {
        return ctx.reply("Tap to add a new server by web interface.", {
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


    bot.command("shortcut", (ctx) => {
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
                    privateKey: null,
                    privateKeyDir: ctx.session.serverPrivateKey
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
                    ctx.session.serverPrivateKey = file.file_id;
                    if (ctx.session.state === 6) {
                        ctx.session.state = 8;
                        sendConnection(ctx, ctx.session.serverAddress, ctx.session.serverPort, ctx.session.serverUsername, {
                            type: "privateKey",
                            password: null,
                            privateKeyDir: ctx.session.serverPrivateKey
                        });
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

    const serverside = () => {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        const ssh = new NodeSSH();

        const app = express();

        const server = http.createServer(app);
        const wss = new WebSocketServer({ server, maxPayload: 131072 });
        const port = process.env.PORT ?? 3000;
        const verifyInitData = (initData) => {
            const urlParams = new URLSearchParams(initData);
            const hash = urlParams.get('hash');
            urlParams.delete('hash');
            urlParams.sort();
            let dataCheckString = '';
            for (const [key, value] of urlParams.entries()) {
                dataCheckString += `${key}=${value}\n`;
            }
            dataCheckString = dataCheckString.slice(0, -1);
            const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.TOKEN ?? '');
            const calculatedHash = crypto.createHmac('sha256', secret.digest()).update(dataCheckString).digest('hex');
            console.log(calculatedHash, hash);
            return calculatedHash === hash;
        }

        app.use(cors());
        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(bodyParser.json());
        app.post("/api/getserverinfo", async (req, res) => {
            const { address, port, username, auth, initData } = req.body;
            const isValid = verifyInitData(initData);
            if (isValid) {
                const data = {
                    address,
                    port,
                    username,
                    auth
                }
                const urlParams = new URLSearchParams(initData);
                const userField = urlParams.get("user");
                const userObject = JSON.parse(decodeURIComponent(userField));
                const userId = userObject.id;
                if (auth.type === "privateKey" && auth.privateKey) {
                    // send private key to user by its buffer
                    console.log("private key" + auth.privateKeyDir);
                    const privateKeyBuffer = Buffer.from(auth.privateKey, "utf-8");
                    const readStream = new InputFile(privateKeyBuffer, "privateKey.pem");
                    const privatekeySend = await bot.api.sendDocument(userId, readStream, {
                        caption: "Private key for the server.",

                    });
                    data.auth.privateKeyDir = privatekeySend.document.file_id;
                    data.auth.privateKey = null;
                }
                const dataKeyboard = new InlineKeyboard().url(
                    "Connect to Terminal",
                    `https://t.me/${process.env.BOT_ID}/${process.env.APP_ID}?startapp=${Buffer.from(JSON.stringify(data)).toString('base64')}`
                );
                await bot.api.sendMessage(userId, `I also make a shortcut for you to use any time or to share to others.`);
                await bot.api.sendMessage(userId, `Connection shortcut:\n🖥 ${address}\n🔐 ${auth.type}`, {
                    reply_markup: dataKeyboard
                });
                return res.json({ status: 200, response: "Data Sent." });
            } else {
                return res.json({ status: 403, response: "Unauthorized" });
            }
        });



        wss.on("connection", async (ws, req) => {
            let ready = false
            let address, port, username, auth
            await new Promise((resolve, reject) => {
                ws.once("message", (message) => {
                    const authData = JSON.parse(message.toString());
                    if (authData.auth) {
                        address = authData.address
                        port = authData.port
                        username = authData.username
                        auth = authData.auth
                        resolve(auth);
                    }

                })
            })
            let authData = {}
            const authType = auth.type

            let keyPath
            if (authType === "password") {
                authData.password = auth.password
            }
            else if (authType === "privateKey") {
                authData.privateKey = auth.privateKey
            }
            else if (authType === "both") {
                authData.privateKey = auth.privateKey
                authData.password = auth.password
            }
            if (authType !== "password" && !auth.privateKey && auth.privateKeyDir) {
                const fileId = auth.privateKeyDir
                const file = await bot.api.getFile(fileId);
                keyPath = `${__dirname}/tmp/${fileId}`
                const filePath = await file.download(keyPath);
                authData.privateKey = fs.readFileSync(filePath, 'utf8');
            }
            const connect = () => {
                ssh
                    .connect({
                        host: address,
                        port,
                        username,
                        ...authData,
                    })
                    .then(async () => {
                        ready = true
                        let tabbed = false
                        ws.send(JSON.stringify({ stdout: "Connected to the server.", service: "connected" }))
                        setInterval(() => {
                            if (ws.readyState === 1) {
                                ws.send(JSON.stringify({ service: "keepalive" }));
                            }
                        }, 10000);
                        const shellStream = await ssh.requestShell();
                        shellStream.on('data', (data) => {
                            let ongoingTimeout
                            if (tabbed && !ongoingTimeout) {
                                const wsMessage = { tabout: data.toString() }
                                ws.send(JSON.stringify(wsMessage))
                                ongoingTimeout = setTimeout(() => {
                                    tabbed = false
                                    ongoingTimeout = null
                                }, 100);
                                return
                            }
                            const wsMessage = { stdout: data.toString().replace('\x1b[?2004h', '').replace('\x1b[?2004l', '') }
                            ws.send(JSON.stringify(wsMessage))
                        });
                        shellStream.stderr.on('data', (data) => {
                            const wsMessage = { stderr: data.toString() }
                            ws.send(JSON.stringify(wsMessage))
                        }
                        );
                        ws.on("message", async (message) => {
                            try {
                                const command = message.toString();
                                if ((JSON.stringify(command)).includes("\\t")) {
                                    tabbed = true
                                }
                                shellStream.write("\r" + command);
                            }
                            catch (err) {
                                console.log(err)
                                const wsMessage = { stderr: err.toString() }
                                ws.send(JSON.stringify(wsMessage))
                            }
                        });
                    }).catch((err) => {
                        console.error('Connection Error:', err);
                        const wsMessage = { stderr: "Authentication failed." }
                        ws.send(JSON.stringify(wsMessage))
                        if (!ready && err.message.includes("parse") && err.message.includes("privateKey") && (authType === "privateKey" || authType === "both")) {
                            const wsMessage = { stdout: "Please enter the passphrase for the private key.", service: "passphrase" }
                            ws.send(JSON.stringify(wsMessage))
                            ws.once("message", (message) => {
                                const passphrase = message.toString();
                                authData.passphrase = passphrase
                                connect()

                            })
                        }
                        else if (!ready && err.message.includes("All") && err.message.includes("authentication") && err.message.includes("methods") && (authType === "password" || authType === "both")) {
                            const wsMessage = { stdout: "Please enter the password.", service: "password" }
                            ws.send(JSON.stringify(wsMessage))
                            ws.once("message", (message) => {
                                const password = message.toString();
                                authData.password = password
                                connect()
                            })
                        }
                    });
            }
            if (authType === "password" && !authData.password) {
                const wsMessage = { stdout: "Please enter the password.", service: "password" }
                ws.send(JSON.stringify(wsMessage));
                ws.once("message", (message) => {
                    const password = message.toString();
                    authData.password = password;
                    connect();
                });
            }
            else if (authType === "privateKey" && !authData.privateKey) {
                authData.privateKey = auth.privateKey
                connect()
            }
            else if (authType === "both" && !authData.privateKey && !authData.password) {
                authData.privateKey = auth.privateKey
                const wsMessage = { stdout: "Please enter the password.", service: "password" }
                ws.send(JSON.stringify(wsMessage));
                ws.once("message", (message) => {
                    const password = message.toString();
                    authData.password = password;
                    connect();
                });
            }
            else {
                connect()
            }
        })

        server.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    }
    serverside()
    bot.start();
}

if (process.env.TOKEN && process.env.URL && process.env.BOT_ID && process.env.APP_ID) {
    main()
}
else {
    console.log("Please set the environment variables.")
}