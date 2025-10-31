import { SlashCommandBuilder } from '@discordjs/builders';
import { loadState, saveState } from '../stateStore.js';
import { getAirportByIata } from '../airlineClient.js';

export const data = new SlashCommandBuilder()
    .setName('baselist')
    .setDescription('Manage your list of base airports')
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Add a base airport by its IATA code')
            .addStringOption(option => 
                option.setName('iata')
                .setDescription('The 3-letter IATA code (e.g., IST)')
                .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('delete')
            .setDescription('Remove a base airport by its IATA code')
            .addStringOption(option => 
                option.setName('iata')
                .setDescription('The 3-letter IATA code (e.g., IST)')
                .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('view')
            .setDescription('View all airports currently in your baselist'));

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const state = await loadState();

    if (subcommand === 'view') {
        const iatas = Object.keys(state.baseAirports);
        if (iatas.length === 0) {
            return interaction.reply({ content: 'Your baselist is currently empty.', ephemeral: true });
        }
        
        const baseListString = iatas.map(iata => `• ${iata} (ID: ${state.baseAirports[iata]})`).join('\n');
        
        return interaction.reply({ content: `**Current Baselist:**\n${baseListString}`, ephemeral: true });
    
    } else if (subcommand === 'add') {
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
            
            // Add to state, mapping IATA -> airportId
            state.baseAirports[iata] = airport.id;
            await saveState(state);
            
            return interaction.editReply(`Added ${iata} (${airport.name}, ${airport.city}) to your baselist.`);

        } catch (error) {
            console.error('Error in baselist add:', error);
            return interaction.editReply('An error occurred while trying to find that airport.');
        }

    } else if (subcommand === 'delete') {
        const iata = interaction.options.getString('iata').toUpperCase();

        if (!state.baseAirports[iata]) {
            return interaction.reply({ content: `Airport ${iata} is not in your baselist.`, ephemeral: true });
        }
        
        delete state.baseAirports[iata];
        await saveState(state);
        
        return interaction.reply({ content: `Removed ${iata} from your baselist.`, ephemeral: true });
    }
}
