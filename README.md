# Routefinder Discord Bot

This is a Discord bot for analyzing profitable flight routes in the game Airline Club. It interacts directly with the game's JSON APIs, without any browser automation.

## Features

-   Analyzes profit-per-frequency for routes from your base airports.
-   Ranks and displays the top 10 most profitable routes per base.
-   Uses your specified `planelist` to only consider planes you own.
-   Calculates profit based on lowest competitor pricing or suggested price.
-   Manages state (accounts, planelist, baselist) in a `bot_state.json` file.

## Setup

### 1. Prerequisites

-   Node.js (v18 or newer recommended)
-   An Ubuntu server (or any machine) to host the bot
-   A Discord Application and Bot token

### 2. Create a Discord Bot

1.  Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2.  Click "New Application" and give it a name (e.g., "Routefinder").
3.  Go to the "Bot" tab.
    -   Click "Add Bot".
    -   Click "Reset Token" and **copy the token**. You will need this for the `.env` file.
    -   Enable the `MESSAGE_CONTENT` Privileged Gateway Intent (if you plan to add non-slash commands later).
4.  Go to the "OAuth2" -> "URL Generator" tab.
    -   Select the `bot` and `application.commands` scopes.
    -   In "Bot Permissions", select `Send Messages`.
    -   Copy the generated URL, paste it into your browser, and invite the bot to your Discord server.

### 3. Server Installation

1.  Clone or copy these files onto your server.
2.  Install Node.js (if not already present):
    ```bash
    curl -fsSL [https://deb.nodesource.com/setup_18.x](https://deb.nodesource.com/setup_18.x) | sudo -E bash -
    sudo apt-get install -y nodejs
    ```
3.  Navigate to the bot's directory and install dependencies:
    ```bash
    npm install
    ```
4.  Create a `.env` file in the root directory:
    ```
    nano .env
    ```
5.  Add your bot token and client ID to this file. **Also add the new `DEBUG_LOGGING` and `TEST_AIRPORT_LIMIT` variables.**
    ```ini
    # Your Discord Bot Token from the developer portal
    DISCORD_BOT_TOKEN=YOUR_TOKEN_HERE

    # Your Application/Client ID from the 'General Information' page
    DISCORD_CLIENT_ID=YOUR_CLIENT_ID_HERE

    # Set to "true" to enable detailed, iterative logging in the console
    DEBUG_LOGGING="true"

    # Set to a number (e.g., 50) to limit analysis to the first X airports for testing.
    # Leave blank or set to 0 to run all airports.
    TEST_AIRPORT_LIMIT=50
    ```
6.  Create the state file with default empty state:
    ```bash
    echo '{ "accounts": {}, "planeList": [], "baseAirports": {} }' > bot_state.json
    ```
    Make sure the bot has permission to write to this file (`chmod 664 bot_state.json`).

### 4. Deploy Slash Commands

You only need to do this once, or when you change commands.

```bash
npm run deploy
