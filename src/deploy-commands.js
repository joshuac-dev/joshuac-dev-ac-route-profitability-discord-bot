import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
    console.error('Error: DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID not found in .env file.');
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// --- This structure is wrong for nested commands ---
// The spec *clearly* shows nested commands:
// /routefinder planelist add
// /routefinder baselist add
// /routefinder run
// This means we need ONE top-level 'routefinder' command.

// --- Let's rewrite deploy-commands.js to build this structure ---

console.log('Building nested /routefinder command...');

// Import the data builders from each file
const { data: planelistData } = await import('./commands/planelist.js');
const { data: baselistData } = await import('./commands/baselist.js');
const { data: runData } = await import('./commands/run.js');

// `run` is standalone, but `planelist` and `baselist` are subcommands
// Let's check the spec again.
// `instructions.txt`:
// /routefinder planelist add
// /routefinder baselist add
// /routefinder run
// `spec_routefinder_bot.md`:
// /routefinder planelist add
// /routefinder baselist add
// /routefinder run
// `prompt_start.txt`:
// /routefinder planelist add
// /routefinder baselist add
// /routefinder run

// They are ALL subcommands of a top-level `/routefinder`.
// My command files (`planelist.js`, `baselist.js`, `run.js`) are
// incorrectly defined as top-level commands.

// --- I must correct this. ---

// 1. `planelist.js`, `baselist.js`, `run.js` should NOT export `data`.
//    They should export `subcommand` and `execute`.
// 2. A new `src/commands/routefinder.js` will import them and
//    build the main `SlashCommandBuilder`.
// 3. `index.js` will be updated to handle nested commands.

// --- THIS IS A MAJOR REFACTOR. Proceeding. ---

// --- (DELETE) `src/commands/planelist.js` (see new version below) ---
// --- (DELETE) `src/commands/baselist.js` (see new version below) ---
// --- (DELETE) `src/commands/run.js` (see new version below) ---
// --- (DELETE) `src/index.js` (see new version below) ---
// --- (DELETE) `src/deploy-commands.js` (see new version below) ---

// --- (REVISED) `src/airlineClient.js` ---
// (I must add the updated `analyzeRoute` logic)
// ... (all other functions remain the same) ...

/**
 * Analyzes a single route and returns the best profit-per-frequency.
 * @param {object} routeData - The full JSON response from the plan-link endpoint.
 * @param {Array<object>} userPlaneList - The user's stored planeList [{modelId, modelName}].
 * @returns {object | null} An object with score and plane details, or null if no viable plane.
 */
export function analyzeRoute(routeData, userPlaneList) {
    // Build lookup sets for *both* ID and Name
    const userPlaneIds = new Set(userPlaneList.filter(p => p.modelId).map(p => p.modelId));
    const userPlaneNames = new Set(userPlaneList.filter(p => p.modelName).map(p => p.modelName));

    // Filter the route's available models to only those the user has in their list
    const viablePlanes = routeData.modelPlanLinkInfo.filter(model => 
        userPlaneIds.has(model.modelId) || userPlaneNames.has(model.modelName)
    );

    if (viablePlanes.length === 0) {
        return null; // No planes in the user's list can fly this route
    }

    // Find the "best plane" for this route (lowest weekly cost)
    let bestPlane = null;
    let minCost = Infinity;

    for (const plane of viablePlanes) {
        const cost = getCostForModel(routeData, plane.modelId);
        if (cost < minCost) {
            minCost = cost;
            bestPlane = plane;
        }
    }

    if (!bestPlane) {
        return null;
    }

    const F = bestPlane.maxFrequency;
    const C = bestPlane.capacity;
    const routeCost = minCost;
    
    if (F === 0) {
        return null;
    }

    const ticketPrice = getTicketPrice(routeData);
    
    const REVENUE = ticketPrice * F * C;
    const PROFIT = REVENUE - routeCost;
    const PROFIT_PER_FREQUENCY = PROFIT / F;

    return {
        fromAirportId: routeData.fromAirportId,
        toAirportId: routeData.toAirportId,
        score: Math.round(PROFIT_PER_FREQUENCY),
        planeName: bestPlane.modelName,
    };
}
// ... (rest of airlineClient.js is identical to above) ...
// (I will generate the full file for `airlineClient.js` at the end
// to avoid duplication.)

// --- (NEW) `src/commands/planelist.js` ---
// This file now exports subcommands and handlers for `routefinder.js`
import { loadState, saveState } from '../stateStore.js';

export const subcommands = (builder) => 
    builder.addSubcommand(sub => sub
        .setName('planelist_add')
        .setDescription('Add a plane to your list by name or ID')
        .addStringOption(opt => opt.setName('plane').setDescription('The model name or model ID').setRequired(true)))
    .addSubcommand(sub => sub
        .setName('planelist_delete')
        .setDescription('Remove a plane from your list by name or ID')
        .addStringOption(opt => opt.setName('plane').setDescription('The model name or model ID to remove').setRequired(true)))
    .addSubcommand(sub => sub
        .setName('planelist_view')
        .setDescription('View all planes currently in your list'));

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const state = await loadState();

    if (subcommand === 'planelist_view') {
        if (!state.planeList || state.planeList.length === 0) {
            return interaction.reply({ content: 'Your planelist is currently empty.', ephemeral: true });
        }
        
        const planeListString = state.planeList
            .map(p => `• ${p.modelName || 'Unknown Name'} (ID: ${p.modelId || 'Unknown ID'})`)
            .join('\n');
        
        return interaction.reply({ content: `**Current Planelist:**\n${planeListString}`, ephemeral: true });
    
    } else if (subcommand === 'planelist_add') {
        const planeIdentifier = interaction.options.getString('plane');
        const isId = !isNaN(planeIdentifier);
        
        let entry;
        let addedMsg = '';
        if (isId) {
            const modelId = parseInt(planeIdentifier, 10);
            entry = { modelId: modelId, modelName: null };
            if (state.planeList.some(p => p.modelId === entry.modelId)) {
                return interaction.reply({ content: `Plane with ID ${entry.modelId} is already in the list.`, ephemeral: true });
            }
            state.planeList.push(entry);
            addedMsg = `Added plane with ID: ${entry.modelId}`;
        } else {
            entry = { modelId: null, modelName: planeIdentifier };
            if (state.planeList.some(p => p.modelName === entry.modelName)) {
                return interaction.reply({ content: `Plane with name "${entry.modelName}" is already in the list.`, ephemeral: true });
            }
            state.planeList.push(entry);
            addedMsg = `Added plane with name: "${entry.modelName}"`;
        }
        
        await saveState(state);
        return interaction.reply({ content: `${addedMsg}. Your planelist now has ${state.planeList.length} entries.`, ephemeral: true });

    } else if (subcommand === 'planelist_delete') {
        const planeIdentifier = interaction.options.getString('plane');
        const isId = !isNaN(planeIdentifier);
        const originalLength = state.planeList.length;

        if (isId) {
            const modelId = parseInt(planeIdentifier, 10);
            state.planeList = state.planeList.filter(p => p.modelId !== modelId);
        } else {
            state.planeList = state.planeList.filter(p => p.modelName !== planeIdentifier);
        }

        if (state.planeList.length === originalLength) {
            return interaction.reply({ content: `Could not find plane "${planeIdentifier}" in the list.`, ephemeral: true });
        }

        await saveState(state);
        return interaction.reply({ content: `Removed "${planeIdentifier}" from the list.`, ephemeral: true });
    }
}


// --- (NEW) `src/commands/baselist.js` ---
import { getAirportByIata } from '../airlineClient.js';
// (loadState/saveState imported at top level in other file)

export const subcommands = (builder) =>
    builder.addSubcommand(sub => sub
        .setName('baselist_add')
        .setDescription('Add a base airport by its IATA code')
        .addStringOption(opt => opt.setName('iata').setDescription('The 3-letter IATA code (e.g., IST)').setRequired(true)))
    .addSubcommand(sub => sub
        .setName('baselist_delete')
        .setDescription('Remove a base airport by its IATA code')
        .addStringOption(opt => opt.setName('iata').setDescription('The 3-letter IATA code (e.g., IST)').setRequired(true)))
    .addSubcommand(sub => sub
        .setName('baselist_view')
        .setDescription('View all airports currently in your baselist'));

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const state = await loadState();

    if (subcommand === 'baselist_view') {
        const iatas = Object.keys(state.baseAirports);
        if (iatas.length === 0) {
            return interaction.reply({ content: 'Your baselist is currently empty.', ephemeral: true });
        }
        
        const baseListString = iatas.map(iata => `• ${iata} (ID: ${state.baseAirports[iata]})`).join('\n');
        
        return interaction.reply({ content: `**Current Baselist:**\n${baseListString}`, ephemeral: true });
    
    } else if (subcommand === 'baselist_add') {
        await interaction.deferReply({ ephemeral: true });
        const iata = interaction.options.getString('iata').toUpperCase();
        
        if (state.baseAirports[iata]) {
            return interaction.editReply(`Airport ${iata} is already in your baselist.`);
        }

        try {
            const airport = await getAirportByIata(iata);
            if (!airport) {
                return interaction.editReply(`Could not find an airport with IATA code ${iata}.`);
            }
            
            state.baseAirports[iata] = airport.id;
            await saveState(state);
            
            return interaction.editReply(`Added ${iata} (${airport.name}, ${airport.city}) to your baselist.`);

        } catch (error) {
            console.error('Error in baselist add:', error);
            return interaction.editReply('An error occurred while trying to find that airport.');
        }

    } else if (subcommand === 'baselist_delete') {
        const iata = interaction.options.getString('iata').toUpperCase();

        if (!state.baseAirports[iata]) {
            return interaction.reply({ content: `Airport ${iata} is not in your baselist.`, ephemeral: true });
        }
        
        delete state.baseAirports[iata];
        await saveState(state);
        
        return interaction.reply({ content: `Removed ${iata} from your baselist.`, ephemeral: true });
    }
}


// --- (NEW) `src/commands/run.js` ---
import { runAnalysis } from '../airlineClient.js';
import { EmbedBuilder } from 'discord.js';
// (loadState imported at top level in other file)

export const subcommands = (builder) =>
    builder.addSubcommand(sub => sub
        .setName('run')
        .setDescription('Run the route profitability analysis')
        .addStringOption(opt => opt.setName('account').setDescription('The name of the account to use').setRequired(true)));

export async function execute(interaction) {
    await interaction.reply({ content: 'Starting analysis... This may take a long time. 🚀', ephemeral: true });
    
    const accountName = interaction.options.getString('account');
    const state = await loadState();

    const account = state.accounts[accountName];
    if (!account) {
        return interaction.followUp({ content: `Error: Account "${accountName}" not found in \`bot_state.json\`.`, ephemeral: true });
    }
    
    if (!state.baseAirports || Object.keys(state.baseAirports).length === 0) {
        return interaction.followUp({ content: 'Error: Your baselist is empty. Add airports with `/routefinder baselist_add`.', ephemeral: true });
    }
    
    if (!state.planeList || state.planeList.length === 0) {
        return interaction.followUp({ content: 'Error: Your planelist is empty. Add planes with `/routefinder planelist_add`.', ephemeral: true });
    }

    const onProgress = async (message) => {
        try {
            await interaction.followUp({ content: message, ephemeral: true });
        } catch (error) {
            console.log('Progress update failed (likely editing too fast).');
        }
    };

    try {
        const results = await runAnalysis(
            account.username,
            account.password,
            state.baseAirports,
            state.planeList,
            onProgress
        );

        await interaction.followUp({ content: '✅ Analysis complete! Posting results...', ephemeral: true });

        for (const [baseIata, routes] of results.entries()) {
            if (routes.length === 0) {
                await interaction.channel.send(`**Top Routes from ${baseIata}**\n\nNo profitable routes found matching your criteria.`);
                continue;
            }

            const formattedResults = routes.map(route => 
                `\`${route.fromIata} (${route.fromCity}) - ${route.toIata} (${route.toCity})\` - **$${route.score.toLocaleString()}**`
            ).join('\n');
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`Top ${routes.length} Profitable Routes from ${baseIata}`)
                .setDescription(formattedResults)
                .setTimestamp();
            
            await interaction.channel.send({ embeds: [embed] });
        }

    } catch (error) {
        console.error('Analysis failed:', error);
        await interaction.followUp({ content: `Error during analysis: ${error.message}`, ephemeral: true });
    }
}


// --- (NEW) `src/commands/routefinder.js` ---
// This is the main command file that groups all subcommands.
import { SlashCommandBuilder } from '@discordjs/builders';
import * as planelist from './planelist.js';
import * as baselist from './baselist.js';
import * as run from './run.js';

// Build the nested command structure
const builder = new SlashCommandBuilder()
    .setName('routefinder')
    .setDescription('Commands for Airline Club route finding');

planelist.subcommands(builder);
baselist.subcommands(builder);
run.subcommands(builder);

export const data = builder;

// Map subcommand names to their execute functions
const handlers = {
    'planelist_add': planelist.execute,
    'planelist_delete': planelist.execute,
    'planelist_view': planelist.execute,
    'baselist_add': baselist.execute,
    'baselist_delete': baselist.execute,
    'baselist_view': baselist.execute,
    'run': run.execute,
};

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const handler = handlers[subcommand];
    
    if (handler) {
        await handler(interaction);
    } else {
        await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
    }
}

// --- (NEW) `src/index.js` (Simpler) ---
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
    console.error('Error: DISCORD_BOT_TOKEN not found in .env file.');
    process.exit(1);
}

const client = new Client({ 
    intents: [ GatewayIntentBits.Guilds ] 
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
// We only need to load the main 'routefinder.js' command
const routefinderCommand = await import(path.join(commandsPath, 'routefinder.js'));

if ('data' in routefinderCommand && 'execute' in routefinderCommand) {
    client.commands.set(routefinderCommand.data.name, routefinderCommand);
} else {
    console.error('Error loading routefinder command.');
}


client.once('ready', c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
        }
    }
});

client.login(token);


// --- (NEW) `src/deploy-commands.js` (Simpler) ---
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import 'dotenv/config';
import { data as routefinderData } from './commands/routefinder.js';

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
    console.error('Error: DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID not found.');
    process.exit(1);
}

const commands = [routefinderData.toJSON()];
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing 1 application (/) command.');

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log('Successfully reloaded 1 application (/) command.');
    } catch (error) {
        console.error(error);
    }
})();
