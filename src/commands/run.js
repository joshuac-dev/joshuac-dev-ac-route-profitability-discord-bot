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
    
    // --- (NEW) Read new .env variables ---
    const isDebug = process.env.DEBUG_LOGGING === 'true';
    const testLimit = parseInt(process.env.TEST_AIRPORT_LIMIT, 10) || 0;

    if (isDebug) {
        console.log('[RUN] *** DEBUG MODE IS ON ***');
    }
    if (testLimit > 0) {
        console.log(`[RUN] *** TEST LIMIT IS ON: Will only scan ${testLimit} airports. ***`);
    }
    // --- End New ---

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

    const onProgress = async (message) => {
        console.log(`[RUN] ${message}`); // This logs the 50/3509 updates
        try {
            await interaction.followUp({ content: message, ephemeral: true });
        } catch (error) {
            console.warn('[WARN] Discord progress update failed (likely editing too fast).');
        }
    };

    try {
        // --- (UPDATED) Pass new variables to the client ---
        const results = await runAnalysis(
            account.username,
            account.password,
            state.baseAirports,
            state.planeList,
            isDebug,
            testLimit,
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
        console.error(`[RUN] Analysis failed: ${error.message}`);
        await interaction.followUp({ content: `Error during analysis: ${error.message}`, ephemeral: true });
    }
}
