import axios from 'axios';
import { wrapper as axiosCookieJarSupport } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const BASE_URL = 'https://www.airline-club.com';

// --- (NEW) Cost Calculation Constants ---
// These are standard assumptions based on game mechanics.
const FUEL_PRICE = 1; // $1 per kg (this can be refined later if we fetch fuel price)
const CREW_COST_PER_MINUTE = 1.5; // Estimated cost per minute of flight time
const AIRPORT_FEE_PER_FLIGHT = 5500; // Estimated avg airport fee (landing + takeoff)
const SERVICE_SUPPLY_COST_PER_PAX = 6; // Estimated cost per passenger
const MAINTENANCE_COST_PER_MINUTE = 15; // Estimated cost per minute of flight time
// --- (END NEW) ---


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
        const response = await client.post(`${BASE_URL}/login`, {}, {
            headers: { 'Authorization': `Basic ${credentials}` }
        });
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
 * Fetches the master list of all airplane models and their base stats.
 */
export async function fetchAirplaneModels(client) {
    console.log('[API] Fetching global airplane model list...');
    try {
        // This is the endpoint you uncovered in `airplane-models Response.txt`
        const response = await client.get(`${BASE_URL}/airplane-models`);
        console.log(`[API] Fetched ${response.data.length} airplane models.`);
        // Convert array to a Map for easy lookup by modelId
        const modelMap = new Map();
        for (const model of response.data) {
            modelMap.set(model.id, model);
        }
        return modelMap;
    } catch (error) {
        console.error('[API] Failed to fetch airplane models:', error.message);
        throw new Error('Could not fetch airplane model list.');
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
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } }
        );
        return response.data;
    } catch (error) {
        console.error(`[API] Failed to fetch route data (${fromAirportId} -> ${toAirportId}):`, error.message);
        return null;
    }
}

/**
 * (REBUILT) Helper to get the weekly cost for a *specific* aircraft model on a route.
 * This now replicates the client-side math.
 */
function getCostForModel(routeData, plane, planeBaseStats, isDebug) {
    if (!planeBaseStats) {
        if (isDebug) console.log(`    [COST] No base stats found for ${plane.modelName} (ID: ${plane.modelId}). Cannot calculate cost.`);
        return null; // Cannot calculate cost without base stats
    }

    // --- INPUTS ---
    const distance = routeData.distance; // e.g., 809
    const flightsPerWeek = plane.maxFrequency; // e.g., 16
    const flightMinutes = plane.flightMinutesRequired; // e.g., 342
    
    const {
        fuelBurn,       // e.g., 52
        capacity,       // e.g., 40
        price,          // e.g., 16200000
        lifespan,       // e.g., 1820
    } = planeBaseStats;

    // --- CALCULATIONS (per week) ---
    
    // 1. Fuel Cost
    // (fuelBurn * distance * 2 trips * flightsPerWeek * fuelPrice)
    const fuelCost = fuelBurn * distance * 2 * flightsPerWeek * FUEL_PRICE;

    // 2. Crew Cost
    // (flightMinutes * flightsPerWeek * crewCostPerMinute)
    const crewCost = flightMinutes * flightsPerWeek * CREW_COST_PER_MINUTE;

    // 3. Airport Fees
    // (flightsPerWeek * 2 trips * feePerFlight)
    const airportFees = flightsPerWeek * 2 * AIRPORT_FEE_PER_FLIGHT;

    // 4. Depreciation
    // (price / lifespan)
    const depreciation = price / lifespan;

    // 5. Service Supplies
    // (capacity * flightsPerWeek * 2 trips * costPerPax)
    const serviceSupplies = capacity * flightsPerWeek * 2 * SERVICE_SUPPLY_COST_PER_PAX;
    
    // 6. Maintenance
    // (flightMinutes * flightsPerWeek * maintenanceCostPerMinute)
    const maintenance = flightMinutes * flightsPerWeek * MAINTENANCE_COST_PER_MINUTE;

    const totalCost = fuelCost + crewCost + airportFees + depreciation + serviceSupplies + maintenance;

    if (isDebug) {
        console.log(`    [COST] Calculatons for ${plane.modelName}:`);
        console.log(`      - Fuel: $${Math.round(fuelCost).toLocaleString()}`);
        console.log(`      - Crew: $${Math.round(crewCost).toLocaleString()}`);
        console.log(`      - Airport: $${Math.round(airportFees).toLocaleString()}`);
        console.log(`      - Depreciation: $${Math.round(depreciation).toLocaleString()}`);
        console.log(`      - Supplies: $${Math.round(serviceSupplies).toLocaleString()}`);
        console.log(`      - Maintenance: $${Math.round(maintenance).toLocaleString()}`);
        console.log(`      - TOTAL WEEKLY COST: $${Math.round(totalCost).toLocaleString()}`);
    }

    return totalCost;
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
 * (REBUILT) Analyzes a single route and returns the best profit-per-frequency.
 */
export function analyzeRoute(routeData, userPlaneList, airplaneModelMap, isDebug) {
    if (isDebug) {
        console.log(`\n[DEBUG] Analyzing route: ${routeData.fromAirportCode} -> ${routeData.toAirportCode}`);
    }

    const userPlaneIds = new Set(userPlaneList.filter(p => p.modelId).map(p => p.modelId));
    const userPlaneNames = new Set(userPlaneList.filter(p => p.modelName).map(p => p.modelName.trim().toLowerCase())); 

    if (isDebug) {
         console.log(`  [DEBUG] Matching against ${userPlaneIds.size} IDs: [${[...userPlaneIds].join(', ')}]`);
         console.log(`  [DEBUG] Matching against ${userPlaneNames.size} names: ["${[...userPlaneNames].join('", "')}"]`);
    }

    const viablePlanes = routeData.modelPlanLinkInfo.filter(model => {
        const apiModelName = model.modelName ? model.modelName.trim().toLowerCase() : null;
        const idMatch = userPlaneIds.has(model.modelId);

        let nameMatch = false;
        if (apiModelName) {
            for (const storedName of userPlaneNames) {
                if (apiModelName.includes(storedName)) {
                    nameMatch = true;
                    break;
                }
            }
        }
        
        if (isDebug) {
            console.log(`    [DEBUG] Checking API plane: "${model.modelName}" (ID: ${model.modelId})`);
            console.log(`      -> ID Match (${model.modelId}): ${idMatch}`);
            console.log(`      -> Name Match (API: "${apiModelName}" includes any from your list?): ${nameMatch}`);
        }
        return idMatch || nameMatch;
    });

    if (viablePlanes.length === 0) {
        if (isDebug) {
            console.log(`  [DEBUG] Skipping: No planes from your planelist can fly this route.`);
        }
        return null; 
    }

    if (isDebug) {
        console.log(`  [DEBUG] Found ${viablePlanes.length} viable planes: ${viablePlanes.map(p => p.modelName).join(', ')}`);
    }

    let bestPlaneForRoute = null;
    let maxScore = -Infinity;
    const ticketPrice = getTicketPrice(routeData);
    
    if (isDebug) {
        console.log(`  [DEBUG] Using Ticket Price: $${ticketPrice}`);
    }

    for (const plane of viablePlanes) {
        // Get the *base stats* for this plane from the master list
        const planeBaseStats = airplaneModelMap.get(plane.modelId);
        
        // Calculate the *true* weekly cost for this specific plane
        const routeCost = getCostForModel(routeData, plane, planeBaseStats, isDebug);

        if (routeCost === null) {
            if (isDebug) console.log(`  [DEBUG] Skipping plane ${plane.modelName}: Could not calculate cost.`);
            continue; // Skip if we couldn't get stats
        }
        
        const F = plane.maxFrequency;
        const C = plane.capacity;
        
        if (F === 0) {
            if (isDebug) {
                console.log(`  [DEBUG] Skipping plane ${plane.modelName}: Frequency is 0.`);
            }
            continue;
        }

        const REVENUE = ticketPrice * F * C;
        const PROFIT = REVENUE - routeCost;
        const SCORE = Math.round(PROFIT / F);

        if (isDebug) {
            console.log(`    [CALC] Final score for ${plane.modelName}:`);
            console.log(`      - Revenue: $${Math.round(REVENUE).toLocaleString()}`);
            console.log(`      - Profit: $${Math.round(PROFIT).toLocaleString()}`);
            console.log(`      - SCORE (Profit / F): $${SCORE.toLocaleString()}`);
        }

        if (SCORE > maxScore) {
            maxScore = SCORE;
            bestPlaneForRoute = plane;
        }
    }

    if (!bestPlaneForRoute) {
        if (isDebug) {
            console.log(`  [DEBUG] Skipping: No viable planes had frequency > 0 or valid stats.`);
        }
        return null;
    }

    if (isDebug) {
        console.log(`  [ANALYSIS] Best plane for route ${routeData.fromAirportCode} -> ${routeData.toAirportCode} is: ${bestPlaneForRoute.modelName} with score $${maxScore.toLocaleString()}`);
    } else if (maxScore > 0) {
        console.log(`  [ANALYSIS] Route ${routeData.fromAirportCode} -> ${routeData.toAirportCode}: Found profit! Score: $${maxScore.toLocaleString()} (Plane: ${bestPlaneForRoute.modelName})`);
    }

    return {
        fromAirportId: routeData.fromAirportId,
        toAirportId: routeData.toAirportId,
        score: maxScore,
        planeName: bestPlaneForRoute.modelName,
    };
}

/**
 * Utility function to add a delay.
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Main analysis runner.
 */
export async function runAnalysis(username, password, baseAirports, userPlaneList, isDebug, testLimit, onProgress) {
    const client = createApiClient();
    
    await onProgress('Logging in...');
    const airlineId = await login(client, username, password);
    
    await onProgress('Fetching global airport list...');
    const allAirports = await fetchAirports(client);

    // --- (NEW) Fetch the master airplane model list *once* ---
    await onProgress('Fetching global airplane model stats...');
    const airplaneModelMap = await fetchAirplaneModels(client);
    // --- (END NEW) ---

    let airportsToScan = allAirports;
    if (testLimit > 0 && testLimit < allAirports.length) {
        airportsToScan = allAirports.slice(0, testLimit);
        console.log(`[ANALYSIS] Limiting scan to first ${airportsToScan.length} airports.`);
    }
    const totalToScan = airportsToScan.length;
    
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

        for (const destAirport of airportsToScan) {
            const toAirportId = destAirport.id;

            if (fromAirportId === toAirportId) {
                processedCount++;
                continue;
            }
            
            const routeData = await fetchRouteData(client, airlineId, fromAirportId, toAirportId);
            
            if (routeData) {
                // --- (UPDATED) Pass the airplaneModelMap to the analyzer ---
                const analysis = analyzeRoute(routeData, userPlaneList, airplaneModelMap, isDebug);
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
