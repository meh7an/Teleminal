import { WebSocketServer } from "ws";
import http from "http";
import cors from "cors";
import express from "express";
import bodyParser from "body-parser";
import { NodeSSH } from "node-ssh";
import fs from "fs";
import https from "https";
import { fileURLToPath } from 'url';
import path from 'path';
import forge from "node-forge";
import { Bot, session, Keyboard, InlineKeyboard } from "grammy";
import { hydrateFiles } from "@grammyjs/files";
import crypto from 'crypto';
import HmacSHA256 from "crypto-js/hmac-sha256.js";
import Hex from "crypto-js/enc-hex.js";
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
        return ctx.reply("Welcome!");
    });


    bot.command("register", (ctx) => {
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

    const serverside = () => {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        const ssh = new NodeSSH();

        const app = express();

        const server = http.createServer(app);
        const wss = new WebSocketServer({ server, maxPayload: 131072 });
        const port = 4602;
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
                const dataKeyboard = new Keyboard().webApp(
                    "Now you can connect to terminal directly.",
                    process.env.URL
                );
                await bot.api.sendMessage(userId, "Connect to Terminal", {
                    reply_markup: dataKeyboard
                });
                return res.json({ status: 200, response: "Data Sent." });
            } else {
                return res.json({ status: 403, response: "Unauthorized" });
            }
        });



        wss.on("connection", async (ws, req) => {
            let ready = false
            const urlData = req.url.replace("/api/", "");
            // const { address, port, username, auth } = JSON.parse(atob(urlData))
            let address, port, username, auth
            const auths = await new Promise((resolve, reject) => {
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
            const token = process.env.TOKEN

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
            console.log(authData);
            // if (authType !== "password") {
            //     const fileName = auth.privateKey.split("/")[1]
            //     if (!fs.existsSync(`${__dirname}/tmp`)) {
            //         fs.mkdirSync(`${__dirname}/tmp`);
            //     }
            //     keyPath = `${__dirname}/tmp/${fileName}`
            //     const file = fs.createWriteStream(keyPath);
            //     await new Promise((resolve, reject) => {
            //         https.get(`https://api.telegram.org/file/bot${token}/${auth.privateKey}`, function (response) {
            //             response.pipe(file);
            //             file.on('finish', function () {
            //                 file.close();
            //                 resolve();
            //             });
            //         });
            //     })
            // }

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
            if (authType === "password" && !auth.password) {
                const wsMessage = { stdout: "Please enter the password.", service: "password" }
                ws.send(JSON.stringify(wsMessage));
                ws.once("message", (message) => {
                    const password = message.toString();
                    authData.password = password;
                    connect();
                });
            }
            else if (authType === "privateKey" && !auth.privateKey) {
                authData.privateKeyPath = keyPath
                connect()
            }
            else if (authType === "both" && !auth.privateKey && !auth.password) {
                authData.privateKeyPath = keyPath
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