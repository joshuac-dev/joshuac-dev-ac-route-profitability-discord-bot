import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import 'dotenv/config';
import { data as routefinderData } from './commands/routefinder.js';

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
    console.error('Error: DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID not found in .env file.');
    process.exit(1);
}

const commands = [routefinderData.toJSON()];
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`Started refreshing 1 application (/) command: /routefinder`);

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`Successfully reloaded /routefinder command.`);
    } catch (error) {
        console.error(error);
    }
})();
