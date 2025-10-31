import { SlashCommandBuilder } from '@discordjs/builders';
import { loadState, saveState } from '../stateStore.js';

export const data = new SlashCommandBuilder()
    .setName('planelist')
    .setDescription('Manage your airline\'s planelist')
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Add a plane to your list by name or ID')
            .addStringOption(option => 
                option.setName('plane')
                .setDescription('The model name or model ID of the plane')
                .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('delete')
            .setDescription('Remove a plane from your list by name or ID')
            .addStringOption(option => 
                option.setName('plane')
                .setDescription('The model name or model ID to remove')
                .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('view')
            .setDescription('View all planes currently in your list'));

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const state = await loadState();

    if (subcommand === 'view') {
        if (state.planeList.length === 0) {
            return interaction.reply({ content: 'Your planelist is currently empty.', ephemeral: true });
        }
        
        const planeListString = state.planeList
            .map(p => `• ${p.modelName} (ID: ${p.modelId})`)
            .join('\n');
        
        return interaction.reply({ content: `**Current Planelist:**\n${planeListString}`, ephemeral: true });
    
    } else if (subcommand === 'add') {
        const planeIdentifier = interaction.options.getString('plane');
        
        // This is a simplification based on the spec. We store what the user
        // provides. The `run` command will match based on modelId OR modelName.
        // A more robust solution would lookup the plane model, but the API for that
        // isn't specified.
        
        const isId = !isNaN(planeIdentifier);
        const modelId = isId ? parseInt(planeIdentifier, 10) : null;
        const modelName = isId ? null : planeIdentifier; // We'll store name if it's not an ID

        // For simplicity, we'll store *both* if we can guess, or just one
        // The spec  requests {modelId, modelName}. Since we don't have
        // a lookup, we'll store what the user gave. A user adding by name
        // won't have an ID, and vice-versa.
        
        // Let's adjust to the spec: if user provides an ID, store it as ID.
        // If user provides a name, store it as name. The matching logic in
        // analyzeRoute will need to be smart.
        
        // Re-reading spec: store {modelId, modelName}.
        // Re-reading planelist add: "<plane> can match either modelName or modelId"
        // This implies we need to find *both* pieces of info.
        
        // This is a gap. We cannot get a modelName from a modelId (or vice-versa)
        // without an API call that is not specified.
        
        // Let's follow `bot_state_example.json`  which has *both*.
        // This means the user *must* provide both, or we simplify.
        
        // Simplification: Store exactly what the user gave.
        // And adjust `analyzeRoute` to match.
        
        // Let's re-write `analyzeRoute` in `airlineClient.js` to handle this.
        // --- In airlineClient.js ---
        // const userPlaneIds = new Set(userPlaneList.map(p => p.modelId));
        // ...
        // const viablePlanes = routeData.modelPlanLinkInfo.filter(model => 
        //     userPlaneIds.has(model.modelId)
        // );
        // ---
        
        // The above logic *only* matches on `modelId`.
        // Let's modify this command to store it properly and the client to match properly.
        
        // --- New Plan ---
        // `planelist add` will require `modelId` AND `modelName`.
        
        // Let's change the command definition.
        
        // --- Re-re-reading spec ---
        // "/routefinder planelist add <plane>"
        // "<plane> can match either the modelName (string) or modelId (number)"
        // "Internally store both modelId and modelName for easy matching later."
        
        // This is contradictory. You cannot store *both* if the user only provides *one*.
        
        // **Executive Decision:** The bot will store *what the user provides*.
        // If they provide a number, it's treated as a `modelId`.
        // If they provide a string, it's treated as a `modelName`.
        // The `analyzeRoute` function will be updated to match on *either*.
        
        // --- Let's update `airlineClient.js`'s `analyzeRoute` ---
        /*
        export function analyzeRoute(routeData, userPlaneList) {
            const userPlaneIds = new Set(userPlaneList.filter(p => p.modelId).map(p => p.modelId));
            const userPlaneNames = new Set(userPlaneList.filter(p => p.modelName).map(p => p.modelName));
            
            const viablePlanes = routeData.modelPlanLinkInfo.filter(model => 
                userPlaneIds.has(model.modelId) || userPlaneNames.has(model.modelName)
            );
            // ... rest of function
        }
        */
        
        // And this command will store based on type.
        
        let entry;
        let addedMsg = '';
        if (isId) {
            entry = { modelId: modelId, modelName: null };
            // Check for duplicates
            if (state.planeList.some(p => p.modelId === entry.modelId)) {
                return interaction.reply({ content: `Plane with ID ${entry.modelId} is already in the list.`, ephemeral: true });
            }
            state.planeList.push(entry);
            addedMsg = `Added plane with ID: ${entry.modelId}`;
        } else {
            entry = { modelId: null, modelName: planeIdentifier };
            // Check for duplicates
            if (state.planeList.some(p => p.modelName === entry.modelName)) {
                return interaction.reply({ content: `Plane with name "${entry.modelName}" is already in the list.`, ephemeral: true });
            }
            state.planeList.push(entry);
            addedMsg = `Added plane with name: "${entry.modelName}"`;
        }
        
        await saveState(state);
        return interaction.reply({ content: `${addedMsg}. Your planelist now has ${state.planeList.length} entries.`, ephemeral: true });

    } else if (subcommand === 'delete') {
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
