"use strict"
console.log(window.Telegram.WebApp);
import Convert from "ansi-to-html";
const convert = new Convert();
const terminal = document.getElementById('terminal')
const historyBox = document.getElementById('history')
const historyScroll = document.getElementById('history-scroll')
const inputBg = document.getElementById('inputBg')
const addMessage = (message) => {
    // check if message has a \r in it. if it does, remove everything before it.
    message = convert.toHtml(message.replace(/ /g, '&nbsp;'))
    message = message.replace(/\n/g, '<br>').replace(/\e\[[^\e]*?m/g, '').replace(//g, '').replace(/^\n?(?<=$3>).*$/g, '');
    // message = message
    if (message.startsWith('\r')) {
        //get the last div in historyBox
        const lastDiv = historyBox.lastChild
        // replace its contents with the message
        lastDiv.innerHTML = message
        return
    }
    const div = document.createElement('div')
    div.innerHTML = message
    historyBox.appendChild(div)
    historyScroll.scrollTop = historyScroll.scrollHeight
}
const webApp = window.Telegram.WebApp

const data = webApp.initDataUnsafe.start_param
let sendingData
if (data) {
    const { address, port, username, auth } = JSON.parse(atob(data))
    sendingData = {
        address,
        port,
        username,
        auth
    }
    const keyValuePairs = [
        { key: "address", value: sendingData.address },
        { key: "port", value: sendingData.port },
        { key: "username", value: sendingData.username },
        { key: "auth", value: JSON.stringify(sendingData.auth) },
    ];
    for (const { key, value } of keyValuePairs) {
        webApp.CloudStorage.setItem(key, value);
    }
}

const platform = webApp.platform
const main = function (data) {
    if (platform === "unknown") {
        return;
    }
    document.body.classList.add(platform)
    let sudo = false
    let sudoCommand = ""
    const initParams = window.Telegram.WebView.initParams
    const themeParams = JSON.parse(initParams.tgWebAppThemeParams)
    console.log(themeParams);
    const terminalInput = document.getElementById('terminal-input')
    const terminalButton = document.getElementById('terminalButton')
    webApp.setHeaderColor(webApp.themeParams.bg_color)
    webApp.setBackgroundColor(webApp.themeParams.bg_color)
    webApp.SettingsButton.show()
    const svgFile = `icons/send-${platform}.svg`
    const getSVG = (svgFile) => fetch(svgFile)
        .then(response => response.text())
        .then(svg => {
            const svgRegex = /<svg.*<\/svg>/g
            svg = svg.match(svgRegex)[0]
            addMessage(svg)
            terminalButton.innerHTML = svg
        })
        .catch(err => {
            console.log(err);
            const svgBackup = `icons/send-macos.svg`
            if (svgFile === svgBackup) {
                return
            }
            getSVG(svgBackup)
            return
        });
    getSVG(svgFile)
    const hideButton = () => {
        terminalButton.style.opacity = 0
        if (platform === "ios") {
            terminalButton.style.margin = 0
            terminalInput.style.marginRight = "0.8rem"
        }
        if (platform === "tdesktop" || platform === "android" || platform === "ios") {
            terminalButton.style.width = 0
            terminalButton.style.height = 0
            terminalButton.style.padding = 0
            terminalButton.firstChild.style.width = 0
        }
    }
    const showButton = () => {
        const buttonIcon = terminalButton.firstChild
        terminalButton.style.opacity = 1
        if (platform === "ios") {
            terminalButton.style.margin = "0 0.8rem 0 0.4rem"
            terminalInput.style.marginRight = 0
        }
        if (platform === "tdesktop" || platform === "android" || platform === "ios") {
            terminalButton.style.width = "2.7rem"
            terminalButton.style.height = "2.2rem"
            terminalButton.style.padding = "0.4rem"
            terminalButton.firstChild.style.width = "1.5rem"
        }
    }

    terminalInput.addEventListener('input', (event) => {
        if (terminalInput.value) {
            showButton()
        }
        else {
            hideButton()
        }
    })
    const socket = new WebSocket(`wss://webapp.mehran.tech/api/${data}`);
    const darkTheme = () => {
        if (webApp.colorScheme === "dark") {
            document.body.classList.add("dark")
        }
        else {
            document.body.classList.remove("dark")
        }
    }

    socket.addEventListener('open', (event) => {
        addMessage('Connected to server')
        socket.send(data)
        darkTheme()
    });

    socket.addEventListener('message', (event) => {
        const rawMessage = event.data
        const messageJSON = JSON.parse(rawMessage)
        const stdout = messageJSON.stdout
        const stderr = messageJSON.stderr
        const service = messageJSON.service
        const tabout = messageJSON.tabout
        let message
        if (typeof event.data === 'string') {
            message = event.data;
            console.log(message);
        }
        if (stdout || stderr) {
            terminalInput.value = ""
        }
        stdout && addMessage(stdout)
        stderr && addMessage(stderr)
        if (tabout) {
            // terminalInput.value = tabout
            // terminalInput.focus()
            console.log("tab" + tabout);
        }
        if (service === "passphrase") {
            terminalInput.type = "password"
            terminalInput.placeholder = "Type the passphrase"
        }
        else if (service === "password") {
            terminalInput.type = "password"
            terminalInput.placeholder = "Type the password"
        }
        else if (service === "connected") {
            terminalInput.type = "text"
            terminalInput.placeholder = "Type a command"
            terminalInput.value = ""
        }
    });

    // WebSocket connection closed
    socket.addEventListener('close', (event) => {
        // disable terminal input
        terminalInput.disabled = true
        terminalInput.placeholder = "Connection closed."
        terminalInput.value = ""
        webApp.MainButton.text = "Reconnect"
        webApp.MainButton.show()
    });
    const sendCommand = (command, tab) => {
        if (command === "clear") {
            historyBox.innerHTML = ""
            terminalInput.value = ""
            return
        }
        else if (command === "exit") {
            socket.close()
            webApp.close()
            return
        }
        else if (command.startsWith("sudo ")) {
            terminalInput.type = "password"
            terminalInput.placeholder = "Type the sudo password"
            terminalInput.value = ""
            // wait for the user to type the password in terminalInput
            sudo = true
            sudoCommand = command.replace("sudo ", "")
            return
        }
        const ending = tab ? '\x09' : '\n'
        socket.send(command + ending)
    }
    terminalInput.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
            if (sudo) {
                const sudoPassword = terminalInput.value
                console.log("sudocommand" + sudoCommand);
                sendCommand(` echo -e "${sudoPassword}" | sudo -S ${sudoCommand}`)
                sudo = false
                terminalInput.type = "text"
                terminalInput.placeholder = "Type a command"
                terminalInput.value = ""
                sudoCommand = ""
                return
            }
            sendCommand(terminalInput.value)
            hideButton()
        }
        if (event.ctrlKey && event.shiftKey && (event.key === 'c' || event.keyCode === 67)) {
            try {
                const selection = window.getSelection().toString()
                await navigator.clipboard.writeText(selection);
            } catch (err) {
                console.error('Failed to copy: ', err);
            }
            event.preventDefault();
        }
        else if (event.ctrlKey && (event.key === 'c' || event.keyCode === 67)) {
            terminalInput.value = ""
            sendCommand('\x03')
            event.preventDefault();
        }
        else if (event.ctrlKey && (event.key === 'x' || event.keyCode === 88)) {
            terminalInput.value = ""
            sendCommand('\x18')
            event.preventDefault();
        }
        // tab button 
        else if (event.key === 'Tab') {
            event.preventDefault();
            // get the input value
            const inputValue = terminalInput.value
            // send the input value to the server,
            sendCommand(inputValue, true)
        }
    })
    interruptButton.addEventListener('click', () => {
        terminalInput.value = ""
        sendCommand('\x03')
    })
    terminalButton.addEventListener('click', (event) => {
        sendCommand(terminalInput.value)
        hideButton()
    })
    historyScroll.addEventListener('click', () => {
        terminalInput.blur();
    });
    webApp.MainButton.onClick(() => {
        if (webApp.MainButton.text === "Close Keyboard") {
            terminalInput.blur();
            webApp.MainButton.hide()
        }
        else if (webApp.MainButton.text === "Reconnect") {
            webApp.MainButton.hide()
            main(data)
        }
    })
    Telegram.WebApp.onEvent('themeChanged', (e) => {
        darkTheme()
    })

    terminalInput.addEventListener('click', () => {
        // inputBg.style.top = window.innerHeight - 50 + "px"
        if (platform === "ios") {
            webApp.MainButton.text = "Close Keyboard"
            webApp.MainButton.show()
            // historyScroll.style.height = `calc (${webApp.viewportHeight}px - 2.8rem)`
            // scroll to the bottom of the page
            terminal.scrollTo(0, 0);
        }
    })

}
const addServer = () => {

    const toggleAuthFields = () => {
        const passwordField = document.getElementById('passwordField');
        const privateKeyField = document.getElementById('privateKeyField');

        const passwordRadio = document.getElementById('passwordRadio');
        const privateKeyRadio = document.getElementById('privateKeyRadio');
        const bothRadio = document.getElementById('bothRadio');

        if (passwordRadio.checked) {
            passwordField.style.display = 'flex';
            privateKeyField.style.display = 'none';
        } else if (privateKeyRadio.checked) {
            passwordField.style.display = 'none';
            privateKeyField.style.display = 'flex';
        } else if (bothRadio.checked) {
            passwordField.style.display = 'flex';
            privateKeyField.style.display = 'flex';
        }
    }
    const submitServer = async () => {
        const serverAddress = document.getElementById('serverIp').value
        const serverPort = document.getElementById('portNumber').value
        const serverUsername = document.getElementById('username').value
        const authType = document.querySelector('input[name="authType"]:checked')?.value
        let serverPrivateKey
        let serverPassword
        let fileContent
        if (authType !== "password") {
            serverPrivateKey = document.getElementById('privateKey').files[0]
            if (serverPrivateKey.size > 4096) {
                webApp.showAlert("The private key file is too big. Please upload a smaller file.")
                return
            }
            const privateKeyPattern = /(-----BEGIN (?:ENCRYPTED )?(?:RSA|DSA|EC|OPENSSH) PRIVATE KEY-----)(?:\n|.)*?(-----END (?:ENCRYPTED )?(?:RSA|DSA|EC|OPENSSH) PRIVATE KEY-----)/;
            fileContent = await serverPrivateKey.text()
            if (!privateKeyPattern.test(fileContent)) {
                webApp.showAlert("The private key file is not valid. Please upload a valid file.")
                return
            }
        }
        if (authType !== "privateKey") {
            serverPassword = document.getElementById('password').value
        }

        const sendingData = {
            address: serverAddress,
            port: serverPort,
            username: serverUsername,
            auth: {
                type: authType,
                password: serverPassword,
                privateKey: fileContent
            },
            initData: Telegram.WebApp.initData
        }

        const response = await fetch('https://webapp.mehran.tech/api/getserverinfo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sendingData)
        })
        const data = await response.json()
        //get data status
        const status = data.status
        if (status !== 200) {
            webApp.showAlert(data.error)
            return
        }
        const keyValuePairs = [
            { key: "address", value: sendingData.address },
            { key: "port", value: sendingData.port },
            { key: "username", value: sendingData.username },
            { key: "auth", value: JSON.stringify(sendingData.auth) },
            { key: "initData", value: sendingData.initData }
        ];
        for (const { key, value } of keyValuePairs) {
            webApp.CloudStorage.setItem(key, value);
        }
        webApp.showAlert("Server added successfully.")
        document.getElementById('addNewServer').style.display = "none"
        document.getElementById('terminal').style.display = "flex"
        delete sendingData.initData
        main(JSON.stringify(sendingData))

    }
    // check if all necessary fields are filled
    const checkFields = () => {
        const serverAddress = document.getElementById('serverIp').value
        const serverPort = document.getElementById('portNumber').value
        const serverUsername = document.getElementById('username').value
        const authType = document.querySelector('input[name="authType"]:checked')?.value
        const serverPassword = document.getElementById('password').value
        const serverPrivateKey = document.getElementById('privateKey').value
        if (serverAddress && serverPort && serverUsername && authType && ((authType === "password" && serverPassword) || (authType === "privateKey" && serverPrivateKey) || (serverPassword && serverPrivateKey))) {
            webApp.MainButton.show()
            webApp.MainButton.text = "Add Server"
        }
        else {
            webApp.MainButton.hide()
        }
    }
    addNewServerForm.addEventListener('input', () => {
        toggleAuthFields()
        checkFields()
    });
    webApp.MainButton.onClick(() => {
        if (webApp.MainButton.text === "Add Server") {
            submitServer()
            webApp.MainButton.hide()
        }
    })
}
if (platform !== "unknown") {
    if (sendingData) {
        document.getElementById('terminal').style.display = "flex"
        main(JSON.stringify(sendingData))
    }
    else {
        webApp.CloudStorage.getItems(["address", "port", "auth", "username"], (err, data) => {
            if (err) {
                document.getElementById('addNewServer').style.display = "flex"
                addServer()
                return
            }
            if (data.address && data.port && data.auth && data.username) {
                const serverData = {
                    address: data.address,
                    port: data.port,
                    username: data.username,
                    auth: JSON.parse(data.auth),
                }
                document.getElementById('terminal').style.display = "flex"
                main(JSON.stringify(serverData))
            }
            else {
                document.getElementById('addNewServer').style.display = "flex"
                addServer()
            }
        }
        )
    }
}

