import { loadState, saveState } from '../stateStore.js';
import { getAirportByIata } from '../airlineClient.js';

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
            // --- (FIX) Using flags: 64 instead of ephemeral: true ---
            return interaction.reply({ content: 'Your baselist is currently empty.', flags: 64 });
        }
        
        const baseListString = iatas.map(iata => `• ${iata} (ID: ${state.baseAirports[iata]})`).join('\n');
        
        // --- (FIX) Using flags: 64 instead of ephemeral: true ---
        return interaction.reply({ content: `**Current Baselist:**\n${baseListString}`, flags: 64 });
    
    } else if (subcommand === 'baselist_add') {
        // --- (FIX) Using flags: 64 instead of ephemeral: true ---
        await interaction.deferReply({ flags: 64 });
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
            // --- (FIX) Using flags: 64 instead of ephemeral: true ---
            return interaction.reply({ content: `Airport ${iata} is not in your baselist.`, flags: 64 });
        }
        
        delete state.baseAirports[iata];
        await saveState(state);
        
        // --- (FIX) Using flags: 64 instead of ephemeral: true ---
        return interaction.reply({ content: `Removed ${iata} from your baselist.`, flags: 64 });
    }
}
