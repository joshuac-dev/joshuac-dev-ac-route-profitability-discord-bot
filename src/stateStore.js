import fs from 'fs/promises';
import path from 'path';

const stateFilePath = path.resolve(process.cwd(), 'bot_state.json');

let stateCache = null;

/**
 * Ensures the state file exists.
 */
async function ensureStateFile() {
    try {
        await fs.access(stateFilePath);
    } catch (error) {
        // File doesn't exist, create it with default structure
        await fs.writeFile(stateFilePath, JSON.stringify({
            accounts: {},
            planeList: [],
            baseAirports: {}
        }, null, 2), 'utf8');
    }
}

/**
 * Loads the bot state from bot_state.json.
 * @param {boolean} forceRefresh - If true, bypasses cache and reads from disk.
 * @returns {Promise<object>} The bot state.
 */
export async function loadState(forceRefresh = false) {
    if (stateCache && !forceRefresh) {
        return stateCache;
    }

    await ensureStateFile();
    
    try {
        const data = await fs.readFile(stateFilePath, 'utf8');
        stateCache = JSON.parse(data);
        // Ensure default structure if file is partial
        stateCache.accounts = stateCache.accounts || {};
        stateCache.planeList = stateCache.planeList || [];
        stateCache.baseAirports = stateCache.baseAirports || {};
        return stateCache;
    } catch (error) {
        console.error('Failed to load state from bot_state.json:', error);
        // Return default structure on parse error
        return { accounts: {}, planeList: [], baseAirports: {} };
    }
}

/**
 * Saves the provided state object to bot_state.json.
 * @param {object} state - The state object to save.
 */
export async function saveState(state) {
    try {
        await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
        stateCache = state; // Update the cache
    } catch (error) {
        console.error('Failed to save state to bot_state.json:', error);
    }
}
