# Teleminal - Telegram SSH Mini App Bot

This is a Telegram bot that allows you to access a terminal SSH mini app directly from your Telegram chat. The app is divided into two parts:

1. **Web** (Located in the `client` folder)

   - The UI is not using any frameworks and it's written by plain JavaScript.

2. **Server** (Located in the `server` folder)

   - WebSocket server that the web part connects to for SSH communication
   - SSH client that connects to the WebSocket server and executes commands on the server
   - Express server that serves the web part
   <!-- also add the link to grammy -->
   - Telegram bot (written by [GrammyJS](https://github.com/grammyjs/grammY)) to control the bot interface

## Configuration

Follow these steps to configure and run the Telegram SSH Mini App Bot:

1. **Clone the Repository**: Clone this repository to your local machine.

   ```bash
   git clone https://github.com/meh7an/Teleminal.git
   cd Teleminal
   ```

2. **Set Up Telegram Bot**:

   - Create a bot on Telegram and obtain the API token from [BotFather](https://core.telegram.org/bots#botfather).
   - Create an `.env` file in the root directory and update the following variables:

     ```
     TOKEN=YOUR_TELEGRAM_BOT_TOKEN
     BOT_ID=YOUR_BOT_ID
     APP_ID=YOUR_APP_ID
     URL=YOUR_APP_URL
     PORT=YOUR_SERVER_PORT
     ```

3. **Install Dependencies**:

   - Install the required dependencies.

     ```
     # In the root directory
     npm install
     ```

4. **Start the App**:

   - Run the following command to start both the web interface and the Telegram bot.

     ```
     # In the root directory
     npm run start
     ```

Your Telegram SSH Mini App Bot should now be up and running. You can interact with the bot in your Telegram bot to open and use the SSH mini app:

## Usage

To add a new server to the Telegram SSH Mini App Bot, follow these steps:

1. Start a chat with the bot on Telegram.

2. Send the `/addserver` command to the bot and tap on "Add Server". You can also open the interface directly by bot's menu button, but you need to configure it in the [BotFather](http://t.me/botfather).

3. Share the necessary server information with the bot. This typically includes the server's hostname or IP address, SSH port, username, and password or SSH key, depending on your authentication method.

4. After sharing the server information, the bot will process it and establish a connection to the server.

5. Once the connection is established, you will receive a connection message indicating that the server has been added successfully. Also, you will get the connection info from the bot's chat.

Enjoy using your Telegram SSH Mini App Bot! If you encounter any issues or have questions, please refer to the [GitHub Issues](https://github.com/meh7an/Teleminal/issues).
