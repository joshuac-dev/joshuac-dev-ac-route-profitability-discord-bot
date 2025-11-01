import { loadState, saveState } from '../stateStore.js';
import { getAirportByIata } from '../airlineClient.js';

export const subcommands = (builder) =>
    builder.addSubcommand(sub => sub
        .setName('excludelist_add')
        .setDescription('Add an airport to exclude from route scans')
        .addStringOption(opt => opt.setName('account').setDescription('The name of the account').setRequired(true))
        .addStringOption(opt => opt.setName('iata').setDescription('The 3-letter IATA code (e.g., IST)').setRequired(true)))
    .addSubcommand(sub => sub
        .setName('excludelist_delete')
        .setDescription('Remove an airport from the exclude list')
        .addStringOption(opt => opt.setName('account').setDescription('The name of the account').setRequired(true))
        .addStringOption(opt => opt.setName('iata').setDescription('The 3-letter IATA code (e.g., IST)').setRequired(true)))
    .addSubcommand(sub => sub
        .setName('excludelist_view')
        .setDescription('View all airports in your exclude list')
        .addStringOption(opt => opt.setName('account').setDescription('The name of the account').setRequired(true)));

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const accountName = interaction.options.getString('account');
    const state = await loadState();

    // Validate account exists
    if (!state.accounts[accountName]) {
        return interaction.reply({ 
            content: `Error: Account "${accountName}" not found in \`bot_state.json\`.`, 
            flags: 64 
        });
    }

    const excludeAirports = state.accounts[accountName].excludeAirports;

    if (subcommand === 'excludelist_view') {
        const iatas = Object.keys(excludeAirports);
        if (iatas.length === 0) {
            return interaction.reply({ content: `The exclude list for account "${accountName}" is currently empty.`, flags: 64 });
        }
        
        const excludeListString = iatas.map(iata => `• ${iata} (ID: ${excludeAirports[iata]})`).join('\n');
        
        return interaction.reply({ content: `**Exclude list for account "${accountName}":**\n${excludeListString}`, flags: 64 });
    
    } else if (subcommand === 'excludelist_add') {
        await interaction.deferReply({ flags: 64 });
        const iata = interaction.options.getString('iata').toUpperCase();
        
        if (excludeAirports[iata]) {
            return interaction.editReply(`Airport ${iata} is already in the exclude list for account "${accountName}".`);
        }

        try {
            const airport = await getAirportByIata(iata);
            if (!airport) {
                return interaction.editReply(`Could not find an airport with IATA code ${iata}.`);
            }
            
            state.accounts[accountName].excludeAirports = {
                ...excludeAirports,
                [iata]: airport.id
            };
            await saveState(state);
            
            return interaction.editReply(`Added ${iata} (${airport.name}, ${airport.city}) to the exclude list for account "${accountName}".`);

        } catch (error) {
            console.error('Error in excludelist add:', error);
            return interaction.editReply('An error occurred while trying to find that airport.');
        }

    } else if (subcommand === 'excludelist_delete') {
        const iata = interaction.options.getString('iata').toUpperCase();

        if (!excludeAirports[iata]) {
            return interaction.reply({ content: `Airport ${iata} is not in the exclude list for account "${accountName}".`, flags: 64 });
        }
        
        const { [iata]: _, ...remainingAirports } = excludeAirports;
        state.accounts[accountName].excludeAirports = remainingAirports;
        await saveState(state);
        
        return interaction.reply({ content: `Removed ${iata} from the exclude list for account "${accountName}".`, flags: 64 });
    }
}
