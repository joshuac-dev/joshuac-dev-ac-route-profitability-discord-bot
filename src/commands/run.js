import { SlashCommandBuilder } from '@discordjs/builders';
import { loadState } from '../stateStore.js';
import { runAnalysis } from '../airlineClient.js';
import { EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('run')
    .setDescription('Run the route profitability analysis')
    .addStringOption(option =>
        option.setName('account')
            .setDescription('The name of the account to use (from bot_state.json)')
            .setRequired(true));

export async function execute(interaction) {
    await interaction.reply({ content: 'Starting analysis... This may take a long time. 🚀', ephemeral: true });
    
    const accountName = interaction.options.getString('account');
    const state = await loadState();

    const account = state.accounts[accountName];
    if (!account) {
        return interaction.followUp({ content: `Error: Account "${accountName}" not found in configuration. Add it to \`bot_state.json\` first.`, ephemeral: true });
    }
    
    if (Object.keys(state.baseAirports).length === 0) {
        return interaction.followUp({ content: 'Error: Your baselist is empty. Add airports with `/baselist add`.', ephemeral: true });
    }
    
    if (state.planeList.length === 0) {
        return interaction.followUp({ content: 'Error: Your planelist is empty. Add planes with `/planelist add`.', ephemeral: true });
    }

    // Function to send progress updates
    const onProgress = async (message) => {
        try {
            // Use followUp for the first message, then edit it
            await interaction.followUp({ content: message, ephemeral: true });
        } catch (error) {
            console.log('Progress update failed (likely editing too fast), trying again.');
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
            
            await interaction.channel.send({ embeds: [embed] });
        }

    } catch (error) {
        console.error('Analysis failed:', error);
        await interaction.followUp({ content: `Error during analysis: ${error.message}`, ephemeral: true });
    }
}
