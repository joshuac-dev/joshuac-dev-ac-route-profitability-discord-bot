import axios from 'axios';
import { wrapper as axiosCookieJarSupport } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const BASE_URL = 'https://www.airline-club.com';

/**
 * Creates a new, sandboxed API client instance with its own cookie jar.
 */
function createApiClient() {
    const jar = new CookieJar();
    const client = axios.create({ jar });
    axiosCookieJarSupport(client);
    client.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
    return client;
}

/**
 * Logs into Airline Club.
 */
export async function login(client, username, password) {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    
    console.log(`[API] Attempting login for ${username}...`);
    
    try {
        const response = await client.post(
            `${BASE_URL}/login`,
            {}, 
            {
                headers: {
                    'Authorization': `Basic ${credentials}`
                }
            }
        );
        
        if (response.data && response.data.airlineIds && response.data.airlineIds.length > 0) {
            console.log(`[API] Login successful. Got airlineId: ${response.data.airlineIds[0]}`);
            return response.data.airlineIds[0];
        } else {
            throw new Error('Login failed: No airlineIds found in response.');
        }
    } catch (error) {
        console.error('[API] Login request failed:', error.message);
        throw new Error('Login failed. Please check credentials and server status.');
    }
}

/**
 * Fetches the global list of all airports.
 */
export async function fetchAirports(client) {
    console.log('[API] Fetching global airport list...');
    try {
        const response = await client.get(`${BASE_URL}/airports`);
        console.log(`[API] Fetched ${response.data.length} airports.`);
        return response.data;
    } catch (error) {
        console.error('[API] Failed to fetch airports:', error.message);
        throw new Error('Could not fetch airport list.');
    }
}

/**
 * Fetches route planning data between two airports.
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
        console.error(`[API] Failed to fetch route data (${fromAirportId} -> ${toAirportId}):`, error.message);
        return null;
    }
}

/**
 * Helper to get the weekly cost for a specific aircraft model on a route.
 */
function getCostForModel(routeData, modelId) {
    // TODO: Replace this when we capture the per-model cost endpoint.
    return routeData.cost;
}

/**
 * Calculates the economy ticket price based on competitor rules.
 */
function getTicketPrice(routeData) {
    const competitors = routeData.otherLinks;
    
    if (competitors && competitors.length > 0) {
        const competitorPrices = competitors.map(comp => comp.price.economy);
        return Math.min(...competitorPrices);
    } else {
        return routeData.suggestedPrice.economy;
    }
}

/**
 * (UPDATED) Analyzes a single route and returns the best profit-per-frequency.
 */
export function analyzeRoute(routeData, userPlaneList, isDebug) {
    if (isDebug) {
        console.log(`\n[DEBUG] Analyzing route: ${routeData.fromAirportCode} -> ${routeData.toAirportCode}`);
    }

    const userPlaneIds = new Set(userPlaneList.filter(p => p.modelId).map(p => p.modelId));
    const userPlaneNames = new Set(userPlaneList.filter(p => p.modelName).map(p => p.modelName));
    
    const viablePlanes = routeData.modelPlanLinkInfo.filter(model => 
        userPlaneIds.has(model.modelId) || userPlaneNames.has(model.modelName)
    );

    if (viablePlanes.length === 0) {
        if (isDebug) {
            console.log(`  [DEBUG] Skipping: No planes from your planelist can fly this route.`);
        }
        return null; 
    }

    if (isDebug) {
        console.log(`  [DEBUG] Found ${viablePlanes.length} viable planes: ${viablePlanes.map(p => p.modelName).join(', ')}`);
    }

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
        return null; // Should not happen if viablePlanes.length > 0
    }

    const F = bestPlane.maxFrequency;
    const C = bestPlane.capacity;
    const routeCost = minCost;
    
    if (F === 0) {
        if (isDebug) {
            console.log(`  [DEBUG] Skipping: Best plane ${bestPlane.modelName} has 0 frequency.`);
        }
        return null;
    }

    const ticketPrice = getTicketPrice(routeData);
    
    const REVENUE = ticketPrice * F * C;
    const PROFIT = REVENUE - routeCost;
    const PROFIT_PER_FREQUENCY = Math.round(PROFIT / F);

    // --- (NEW) Detailed logging block ---
    if (isDebug) {
        console.log(`  [ANALYSIS] Route ${routeData.fromAirportCode} -> ${routeData.toAirportCode}:`);
        console.log(`    - Plane: ${bestPlane.modelName}`);
        console.log(`    - Ticket: $${ticketPrice.toLocaleString()}`);
        console.log(`    - Freq: ${F}, Capacity: ${C}`);
        console.log(`    - Revenue (Ticket * F * C): $${Math.round(REVENUE).toLocaleString()}`);
        console.log(`    - Cost (Weekly): $${Math.round(routeCost).toLocaleString()}`);
        console.log(`    - Profit (Rev - Cost): $${Math.round(PROFIT).toLocaleString()}`);
        console.log(`    - SCORE (Profit / F): $${PROFIT_PER_FREQUENCY.toLocaleString()}`);
    } else if (PROFIT_PER_FREQUENCY > 0) {
        // This logs any profitable route even when debug is off
        console.log(`  [ANALYSIS] Route ${routeData.fromAirportCode} -> ${routeData.toAirportCode}: Found profit! Score: $${PROFIT_PER_FREQUENCY.toLocaleString()} (Plane: ${bestPlane.modelName})`);
    }
    // --- End New ---

    return {
        fromAirportId: routeData.fromAirportId,
        toAirportId: routeData.toAirportId,
        score: PROFIT_PER_FREQUENCY,
        planeName: bestPlane.modelName,
    };
}

/**
 * Utility function to add a delay.
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * (UPDATED) Main analysis runner.
 */
export async function runAnalysis(username, password, baseAirports, userPlaneList, isDebug, testLimit, onProgress) {
    const client = createApiClient();
    
    await onProgress('Logging in...');
    const airlineId = await login(client, username, password);
    
    await onProgress('Fetching global airport list...');
    const allAirports = await fetchAirports(client);

    // --- (NEW) Apply test limit ---
    let airportsToScan = allAirports;
    if (testLimit > 0 && testLimit < allAirports.length) {
        airportsToScan = allAirports.slice(0, testLimit);
        console.log(`[ANALYSIS] Limiting scan to first ${airportsToScan.length} airports.`);
    }
    const totalToScan = airportsToScan.length;
    // --- End New ---
    
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
            console.warn(`[WARN] Skipping base ${baseIata}: Not found in airport list.`);
            await onProgress(`Skipping base ${baseIata}: Not found in airport list.`);
            continue;
        }

        console.log(`[ANALYSIS] === Starting analysis for base: ${baseIata} (${fromAirport.city}) ===`);

        const baseProgress = `(Base ${baseIndex}/${baseIatas.length})`;
        await onProgress(`Analyzing routes from ${baseIata} ${baseProgress}... (0/${totalToScan})`);
        
        let routeScores = [];
        let processedCount = 0;

        // --- (UPDATED) Loop over airportsToScan ---
        for (const destAirport of airportsToScan) {
            const toAirportId = destAirport.id;

            if (fromAirportId === toAirportId) {
                processedCount++;
                continue;
            }
            
            const routeData = await fetchRouteData(client, airlineId, fromAirportId, toAirportId);
            
            if (routeData) {
                // --- (UPDATED) Pass isDebug ---
                const analysis = analyzeRoute(routeData, userPlaneList, isDebug);
                if (analysis) {
                    analysis.fromIata = fromAirport.iata;
                    analysis.fromCity = fromAirport.city;
                    analysis.toIata = destAirport.iata;
                    analysis.toCity = destAirport.city;
                    routeScores.push(analysis);
                }
            }
            
            processedCount++;
            if (processedCount % 50 === 0) { 
                await onProgress(`Analyzing routes from ${baseIata} ${baseProgress}... (${processedCount}/${totalToScan})`);
            }

            await delay(150);
        }
        // --- End Update ---

        routeScores.sort((a, b) => b.score - a.score);
        allResults.set(baseIata, routeScores.slice(0, 10));
        
        console.log(`[ANALYSIS] === Completed base ${baseIata}. Found ${routeScores.length} viable routes. Top 10 saved. ===`);
        baseIndex++;
    }
    
    console.log('[ANALYSIS] All bases complete.');
    return allResults;
}

/**
 * Standalone helper to find an airport by IATA.
 */
export async function getAirportByIata(iata) {
    const client = createApiClient(); 
    console.log(`[API] Fetching airport by IATA: ${iata}`);
    try {
        const allAirports = await fetchAirports(client);
        const airport = allAirports.find(a => a.iata.toUpperCase() === iata.toUpperCase()) || null;
        if (airport) {
            console.log(`[API] Found ${iata}: ${airport.name} (ID: ${airport.id})`);
        } else {
            console.warn(`[API] Could not find airport with IATA: ${iata}`);
        }
        return airport;
    } catch (error) {
        console.error("[API] Failed to get airport by IATA:", error);
        return null;
    }
}
