import { SlashCommandBuilder } from '@discordjs/builders';
import * as planelist from './planelist.js';
import * as baselist from './baselist.js';
import * as run from './run.js';

// Build the nested command structure
const builder = new SlashCommandBuilder()
    .setName('routefinder')
    .setDescription('Commands for Airline Club route finding');

// Attach subcommands from other files
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
