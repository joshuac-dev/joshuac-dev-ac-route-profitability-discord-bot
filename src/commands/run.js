import { loadState } from '../stateStore.js';
import { runAnalysis } from '../airlineClient.js';
import { EmbedBuilder } from 'discord.js';

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
            // Send all progress updates as new follow-ups
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

            // Format results as specified [cite: 48]
            const formattedResults = routes.map(route => 
                `\`${route.fromIata} (${route.fromCity}) - ${route.toIata} (${route.toCity})\` - **$${route.score.toLocaleString()}**`
            ).join('\n');
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`Top ${routes.length} Profitable Routes from ${baseIata}`)
                .setDescription(formattedResults)
                .setTimestamp();
            
            // Send results to the channel where command was run
            await interaction.channel.send({ embeds: [embed] });
        }

    } catch (error) {
        console.error('Analysis failed:', error);
        await interaction.followUp({ content: `Error during analysis: ${error.message}`, ephemeral: true });
    }
}
