import axios from 'axios';
import { wrapper as axiosCookieJarSupport } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const BASE_URL = 'https://www.airline-club.com';

/**
 * Creates a new, sandboxed API client instance with its own cookie jar.
 * @returns {axios.AxiosInstance} An axios instance configured with cookie support.
 */
function createApiClient() {
    const jar = new CookieJar();
    const client = axios.create({ jar });
    axiosCookieJarSupport(client);
    
    // Set default headers required by the API
    client.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
    
    return client;
}

/**
 * Logs into Airline Club.
 * @param {axios.AxiosInstance} client - The axios client instance.
 * @param {string} username - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<number>} The first airlineId from the login response.
 */
export async function login(client, username, password) {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    
    try {
        const response = await client.post(
            `${BASE_URL}/login`,
            {}, // Empty body
            {
                headers: {
                    'Authorization': `Basic ${credentials}`
                }
            }
        );
        
        if (response.data && response.data.airlineIds && response.data.airlineIds.length > 0) {
            return response.data.airlineIds[0]; // Return the first airlineId
        } else {
            throw new Error('Login failed: No airlineIds found in response.');
        }
    } catch (error) {
        console.error('Login request failed:', error.message);
        throw new Error('Login failed. Please check credentials and server status.');
    }
}

/**
 * Fetches the global list of all airports.
 * @param {axios.AxiosInstance} client - The authenticated axios client.
 * @returns {Promise<Array<object>>} A list of all airport objects.
 */
export async function fetchAirports(client) {
    try {
        const response = await client.get(`${BASE_URL}/airports`);
        return response.data;
    } catch (error) {
        console.error('Failed to fetch airports:', error.message);
        throw new Error('Could not fetch airport list.');
    }
}

/**
 * Fetches route planning data between two airports.
 * @param {axios.AxiosInstance} client - The authenticated axios client.
 * @param {number} airlineId - The user's airline ID.
 * @param {number} fromAirportId - The origin airport ID.
 * @param {number} toAirportId - The destination airport ID.
 * @returns {Promise<object>} The route data response from the plan-link endpoint.
 */
export async function fetchRouteData(client, airlineId, fromAirportId, toAirportId) {
    const params = new URLSearchParams();
    params.append('airlineId', airlineId);
    params.append('fromAirportId', fromAirportId);
    params.append('toAirportId', toAirportId);

    try {
        const response = await client.post(
            `${BASE_URL}/airlines/${airlineId}/plan-link`,
            params,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error(`Failed to fetch route data (${fromAirportId} -> ${toAirportId}):`, error.message);
        return null; // Return null to allow the loop to continue
    }
}

/**
 * Helper to get the weekly cost for a specific aircraft model on a route.
 * @param {object} routeData - The full JSON response from the plan-link endpoint.
 * @param {number} modelId - The modelId of the plane.
 * @returns {number} The weekly cost.
 */
function getCostForModel(routeData, modelId) {
    // TODO: Replace this when we capture the per-model cost endpoint[cite: 53].
    // For now, as per NOTES_FOR_AI.md, we assume the single top-level `cost`
    // applies to all models, even though this is incorrect.
    return routeData.cost;
}

/**
 * Calculates the economy ticket price based on competitor rules[cite: 47].
 * @param {object} routeData - The full JSON response from the plan-link endpoint.
 * @returns {number} The ticket price to use.
 */
function getTicketPrice(routeData) {
    const competitors = routeData.otherLinks;
    
    if (competitors && competitors.length > 0) {
        // Find the lowest economy price from all competitors
        const competitorPrices = competitors.map(comp => comp.price.economy);
        return Math.min(...competitorPrices);
    } else {
        // Fall back to suggested price if no competitors
        return routeData.suggestedPrice.economy;
    }
}

/**
 * Analyzes a single route and returns the best profit-per-frequency.
 * @param {object} routeData - The full JSON response from the plan-link endpoint.
 * @param {Array<object>} userPlaneList - The user's stored planeList [{modelId, modelName}].
 * @returns {object | null} An object with score and plane details, or null if no viable plane.
 */
export function analyzeRoute(routeData, userPlaneList) {
    // Build lookup sets for *both* ID and Name, filtering out nulls
    const userPlaneIds = new Set(userPlaneList.filter(p => p.modelId).map(p => p.modelId));
    const userPlaneNames = new Set(userPlaneList.filter(p => p.modelName).map(p => p.modelName));
    
    // Filter the route's available models to only those the user has in their list
    const viablePlanes = routeData.modelPlanLinkInfo.filter(model => 
        userPlaneIds.has(model.modelId) || userPlaneNames.has(model.modelName)
    );

    if (viablePlanes.length === 0) {
        return null; // No planes in the user's list can fly this route
    }

    // Find the "best plane" for this route (lowest weekly cost) [cite: 47]
    let bestPlane = null;
    let minCost = Infinity;

    for (const plane of viablePlanes) {
        const cost = getCostForModel(routeData, plane.modelId);
        if (cost < minCost) {
            minCost = cost;
            bestPlane = plane;
        }
    }

    if (!bestPlane) {
        return null;
    }

    // Now, calculate profit using this "best plane"
    const F = bestPlane.maxFrequency; // Max Frequency
    const C = bestPlane.capacity;     // Capacity
    const routeCost = minCost;        // Weekly Cost
    
    // Handle division by zero case
    if (F === 0) {
        return null;
    }

    const ticketPrice = getTicketPrice(routeData);
    
    const REVENUE = ticketPrice * F * C;
    const PROFIT = REVENUE - routeCost;
    const PROFIT_PER_FREQUENCY = PROFIT / F;

    return {
        fromAirportId: routeData.fromAirportId,
        toAirportId: routeData.toAirportId,
        score: Math.round(PROFIT_PER_FREQUENCY), // Round to whole dollar [cite: 47]
        planeName: bestPlane.modelName,
    };
}

/**
 * Utility function to add a delay.
 * @param {number} ms - Milliseconds to wait.
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Main analysis runner.
 * @param {string} username - Account username.
 * @param {string} password - Account password.
 * @param {object} baseAirports - The user's { IATA: id } map.
 * @param {Array<object>} userPlaneList - The user's [{modelId, modelName}] list.
 * @param {Function} onProgress - Callback function for progress updates (e.g., interaction.followUp).
 * @returns {Promise<Map<string, Array<object>>>} A map of BaseIATA -> sorted results array.
 */
export async function runAnalysis(username, password, baseAirports, userPlaneList, onProgress) {
    const client = createApiClient();
    
    await onProgress('Logging in...');
    const airlineId = await login(client, username, password);
    
    await onProgress('Fetching global airport list...');
    const allAirports = await fetchAirports(client);
    
    // Build lookups for easy formatting
    const airportIdLookup = new Map();
    for (const airport of allAirports) {
        airportIdLookup.set(airport.id, airport);
    }
    
    const allResults = new Map();
    const baseIatas = Object.keys(baseAirports);
    let baseIndex = 1;

    for (const baseIata of baseIatas) {
        const fromAirportId = baseAirports[baseIata];
        const fromAirport = airportIdLookup.get(fromAirportId);
        
        if (!fromAirport) {
            await onProgress(`Skipping base ${baseIata}: Not found in airport list.`);
            continue;
        }

        const baseProgress = `(Base ${baseIndex}/${baseIatas.length})`;
        await onProgress(`Analyzing routes from ${baseIata} ${baseProgress}... (0/${allAirports.length})`);
        
        let routeScores = [];
        let processedCount = 0;

        for (const destAirport of allAirports) {
            const toAirportId = destAirport.id;

            // Skip if it's the same airport
            if (fromAirportId === toAirportId) {
                processedCount++;
                continue;
            }
            
            const routeData = await fetchRouteData(client, airlineId, fromAirportId, toAirportId);
            
            if (routeData) {
                const analysis = analyzeRoute(routeData, userPlaneList);
                if (analysis) {
                    // Add city/IATA info for final formatting
                    analysis.fromIata = fromAirport.iata;
                    analysis.fromCity = fromAirport.city;
                    analysis.toIata = destAirport.iata;
                    analysis.toCity = destAirport.city;
                    routeScores.push(analysis);
                }
            }
            
            processedCount++;
            if (processedCount % 50 === 0) { // Update progress every 50 airports
                await onProgress(`Analyzing routes from ${baseIata} ${baseProgress}... (${processedCount}/${allAirports.length})`);
            }

            // Add mandatory delay to avoid hammering the server [cite: 47]
            await delay(150); // 150ms delay
        }

        // Sort results for this base
        routeScores.sort((a, b) => b.score - a.score);
        
        // Store top 10 [cite: 47]
        allResults.set(baseIata, routeScores.slice(0, 10));
        baseIndex++;
    }
    
    return allResults;
}

/**
 * Standalone helper to find an airport by IATA.
 * @param {string} iata - The IATA code.
 * @returns {Promise<object|null>} The airport object or null.
 */
export async function getAirportByIata(iata) {
    // This function must use its own client, as it's used
    // by baselist commands without a full login session.
    const client = createApiClient(); 
    try {
        const allAirports = await fetchAirports(client);
        return allAirports.find(a => a.iata.toUpperCase() === iata.toUpperCase()) || null;
    } catch (error) {
        console.error("Failed to get airport by IATA:", error);
        return null;
    }
}
