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
import dotenv from "dotenv";
dotenv.config();

// const ansiRegex = require('ansi-regex');
import ansiRegex from "ansi-regex";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ssh = new NodeSSH();

const app = express();

const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 131072 });
const port = 4602;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.get("/api/test", async (req, res) => {
    return res.json({ categories: ["test"] });
});



wss.on("connection", async (ws, req) => {
    let ready = false
    const urlData = req.url.replace("/api/", "");
    const { address, port, username, auth } = JSON.parse(atob(urlData))
    let authData = {}
    const authType = auth.type
    const token = process.env.TOKEN

    let keyPath

    if (authType !== "password") {
        const fileName = auth.privateKey.split("/")[1]
        if (!fs.existsSync(`${__dirname}/tmp`)) {
            fs.mkdirSync(`${__dirname}/tmp`);
        }
        keyPath = `${__dirname}/tmp/${fileName}`
        const file = fs.createWriteStream(keyPath);
        await new Promise((resolve, reject) => {
            https.get(`https://api.telegram.org/file/bot${token}/${auth.privateKey}`, function (response) {
                response.pipe(file);
                file.on('finish', function () {
                    file.close();
                    resolve();
                });
            });
        })
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
    if (authType === "password") {
        const wsMessage = { stdout: "Please enter the password.", service: "password" }
        ws.send(JSON.stringify(wsMessage));
        ws.once("message", (message) => {
            const password = message.toString();
            authData.password = password;
            connect();
        });
    }
    else if (authType === "privateKey") {
        authData.privateKeyPath = keyPath
        connect()
    }
    else if (authType === "both") {
        authData.privateKeyPath = keyPath
        const wsMessage = { stdout: "Please enter the password.", service: "password" }
        ws.send(JSON.stringify(wsMessage));
        ws.once("message", (message) => {
            const password = message.toString();
            authData.password = password;
            connect();
        });
    }
})

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});