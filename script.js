"use strict"
console.log(window.Telegram.WebApp);
import Convert from "ansi-to-html";
import ansiRegex from "ansi-regex";

const convert = new Convert();
const terminal = document.getElementById('terminal')
const historyBox = document.getElementById('history')
const historyScroll = document.getElementById('history-scroll')
const inputBg = document.getElementById('inputBg')
const addMessage = (message) => {
    // check if message has a \r in it. if it does, remove everything before it.
    message = convert.toHtml(message.replace(/ /g, '&nbsp;'), {
        colors: {
            0: "#000",
            1: "#A00",
            2: "#0A0",
            3: "#A50",
            4: "#00A",
            5: "#A0A",
            6: "#0AA",
            7: "#AAA",
            8: "#555",
            9: "#F55",
            10: "#5F5",
            11: "#FF5",
            12: "#55F",
            13: "#F5F",
            14: "#5FF",
            15: "#FFF",
        },
    })
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
//get the url arguments
const args = webApp.initParams
// webApp.MainButton.show()
const platform = webApp.platform
const main = function () {
    document.body.classList.add(platform)
    if (platform === "unknown") {
        return;
    }
    let sudo = false
    let sudoCommand = ""
    const initParams = window.Telegram.WebView.initParams
    const data = window.Telegram.WebApp.initDataUnsafe.start_param
    // data is base64. turn it into a string
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
    // webApp.MainButton.onClick(() => webApp.sendData("dodododo"))
    // if input is not empty, set button opacity to 1, otherwise set it to 0.
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
            main()
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

main()