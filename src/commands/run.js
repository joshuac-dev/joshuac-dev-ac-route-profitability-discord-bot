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
    console.log(`[RUN] Starting analysis for account: ${accountName}`);
    
    const state = await loadState();

    const account = state.accounts[accountName];
    if (!account) {
        console.error(`[RUN] Error: Account "${accountName}" not found.`);
        return interaction.followUp({ content: `Error: Account "${accountName}" not found in \`bot_state.json\`.`, ephemeral: true });
    }
    
    console.log('[RUN] Validating state: Checking for baselist and planelist.');
    if (!state.baseAirports || Object.keys(state.baseAirports).length === 0) {
        console.error('[RUN] Error: Baselist is empty.');
        return interaction.followUp({ content: 'Error: Your baselist is empty. Add airports with `/routefinder baselist_add`.', ephemeral: true });
    }
    
    if (!state.planeList || state.planeList.length === 0) {
        console.error('[RUN] Error: Planelist is empty.');
        return interaction.followUp({ content: 'Error: Your planelist is empty. Add planes with `/routefinder planelist_add`.', ephemeral: true });
    }
    console.log('[RUN] State validated. Starting analysis client.');

    // --- UPDATED onProgress FUNCTION ---
    // This now logs to console *and* sends to Discord
    const onProgress = async (message) => {
        console.log(`[RUN] ${message}`); // <--- ADDED THIS LINE
        try {
            // Send all progress updates as new follow-ups
            await interaction.followUp({ content: message, ephemeral: true });
        } catch (error) {
            // This error is common (editing too fast), just log it
            console.warn('[WARN] Discord progress update failed (likely editing too fast).');
        }
    };
    // --- END UPDATE ---

    try {
        const results = await runAnalysis(
            account.username,
            account.password,
            state.baseAirports,
            state.planeList,
            onProgress
        );

        console.log('[RUN] Analysis complete. Posting results to Discord.');
        await interaction.followUp({ content: '✅ Analysis complete! Posting results...', ephemeral: true });

        for (const [baseIata, routes] of results.entries()) {
            if (routes.length === 0) {
                console.log(`[RUN] No profitable routes found for ${baseIata}.`);
                await interaction.channel.send(`**Top Routes from ${baseIata}**\n\nNo profitable routes found matching your criteria.`);
                continue;
            }

            console.log(`[RUN] Posting top ${routes.length} routes for ${baseIata}.`);
            // Format results as specified
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
        console.error(`[RUN] Analysis failed: ${error.message}`);
        await interaction.followUp({ content: `Error during analysis: ${error.message}`, ephemeral: true });
    }
}
