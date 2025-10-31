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
            // --- (FIX) Normalize the name before saving ---
            const normalizedName = planeIdentifier.trim().toLowerCase();
            entry = { modelId: null, modelName: normalizedName };

            if (state.planeList.some(p => p.modelName === entry.modelName)) {
                return interaction.reply({ content: `Plane with name "${normalizedName}" is already in the list.`, ephemeral: true });
            }
            state.planeList.push(entry);
            // Give user feedback on the normalization
            addedMsg = `Added plane with name: "${planeIdentifier}" (stored as: ${normalizedName})`;
            // --- End Fix ---
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
            // --- (FIX) Normalize name for deletion too ---
            const normalizedName = planeIdentifier.trim().toLowerCase();
            state.planeList = state.planeList.filter(p => p.modelName !== normalizedName);
            // --- End Fix ---
        }

        if (state.planeList.length === originalLength) {
            return interaction.reply({ content: `Could not find plane "${planeIdentifier}" in the list.`, ephemeral: true });
        }

        await saveState(state);
        return interaction.reply({ content: `Removed "${planeIdentifier}" from the list.`, ephemeral: true });
    }
}
