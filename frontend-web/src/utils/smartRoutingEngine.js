/**
 * Smart Routing & Scheduling Engine
 *
 * Business Rules
 * ──────────────
 * • Appointments within 6 km  → same region
 * • Max delay allowed         → 10 min
 * • Ideal delay               → < 5 min
 * • Rescheduling              → suggestions ONLY (never automatic)
 *
 * Priorities: 1. Minimize delay  2. Minimize travel distance
 *
 * Output types: "direct" | "delay" | "reschedule"
 *
 * Bonus: OR-Tools integration is described at the bottom as a
 * backend microservice contract (Python/gRPC) — see ORTOOLS_CONTRACT.
 */

// ── CONFIG ───────────────────────────────────────────────
export const ENGINE_CONFIG = {
  SAME_REGION_KM:       6,
  MAX_DELAY_MIN:        10,
  IDEAL_DELAY_MIN:      5,
  AVG_SPEED_KMH:        35,     // urban average
  SCORE_WEIGHTS:        { delay: 0.70, distance: 0.30 },
  TWO_OPT_MAX_ITER:     60,
  CONFIDENCE_THRESHOLD: 0.40,   // min confidence to surface a suggestion
  OSRM_BASE:            "https://router.project-osrm.org",
  OSRM_TIMEOUT_MS:      8000,
};

// ── HAVERSINE ────────────────────────────────────────────
export function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * (Math.PI / 180);
  const dLng = (b.lng - a.lng) * (Math.PI / 180);
  const sin2Lat = Math.sin(dLat / 2) ** 2;
  const sin2Lng = Math.sin(dLng / 2) ** 2;
  const c = sin2Lat + Math.cos(a.lat * (Math.PI / 180)) * Math.cos(b.lat * (Math.PI / 180)) * sin2Lng;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

// ── TIME HELPERS ─────────────────────────────────────────
export function timeToMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function minToTime(min) {
  const h = Math.floor(Math.max(0, min) / 60) % 24;
  const m = Math.round(Math.max(0, min) % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function travelMin(km, speedKmh = ENGINE_CONFIG.AVG_SPEED_KMH) {
  return (km / speedKmh) * 60;
}

// ── DISTANCE MATRIX ──────────────────────────────────────
function buildDistMatrix(points) {
  const n = points.length;
  const mat = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(points[i], points[j]);
      mat[i][j] = d;
      mat[j][i] = d;
    }
  return mat;
}

// ── OSRM DURATION MATRIX (async, falls back to haversine) ──
export async function fetchOsrmMatrix(points) {
  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${ENGINE_CONFIG.OSRM_BASE}/table/v1/driving/${coords}?annotations=duration`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ENGINE_CONFIG.OSRM_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json();
    if (data.code !== "Ok") return null;
    // Convert seconds → minutes
    return data.durations.map((row) => row.map((s) => s / 60));
  } catch {
    return null;
  }
}

// ── ROUTE OPTIMIZATION ───────────────────────────────────
//   Nearest Neighbour TSP → 2-Opt refinement
//   Index 0 in the allPoints array is always the origin (kept fixed).

function nearestNeighbour(distOrTime, n) {
  const visited = new Array(n).fill(false);
  const route = [0];
  visited[0] = true;
  for (let step = 1; step < n; step++) {
    const last = route[route.length - 1];
    let best = -1, bestD = Infinity;
    for (let j = 1; j < n; j++) {
      if (!visited[j] && distOrTime[last][j] < bestD) { best = j; bestD = distOrTime[last][j]; }
    }
    if (best === -1) break;
    route.push(best);
    visited[best] = true;
  }
  return route;
}

function twoOpt(route, distOrTime) {
  let best = [...route];
  let improved = true;
  let iter = 0;
  while (improved && iter < ENGINE_CONFIG.TWO_OPT_MAX_ITER) {
    improved = false; iter++;
    for (let i = 1; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const before = distOrTime[best[i - 1]][best[i]] + distOrTime[best[j]][best[(j + 1) % best.length]];
        const after  = distOrTime[best[i - 1]][best[j]] + distOrTime[best[i]][best[(j + 1) % best.length]];
        if (after < before - 1e-9) {
          // Reverse segment [i..j], origin (idx 0) stays fixed
          let l = i, r = j;
          const next = [...best];
          while (l < r) { [next[l], next[r]] = [next[r], next[l]]; l++; r--; }
          best = next;
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * Optimise the order of `stops` starting from `origin`.
 * Returns { order: number[], totalKm: number, matrix: number[][] }
 * where `order` is 0-based indices into the `stops` array.
 */
export function optimizeRoute(stops, origin, timeMatrix = null) {
  if (!stops.length) return { order: [], totalKm: 0, matrix: [] };
  if (stops.length === 1) return { order: [0], totalKm: haversineKm(origin, stops[0]), matrix: [] };

  const allPts = [origin, ...stops];
  const distMat = buildDistMatrix(allPts);
  const mat = timeMatrix || distMat; // prefer OSRM durations if available

  const nn   = nearestNeighbour(mat, allPts.length);
  const opt  = twoOpt(nn, mat);

  // Total km (haversine, regardless of the matrix used for ordering)
  let totalKm = 0;
  for (let i = 0; i < opt.length - 1; i++)
    totalKm += distMat[opt[i]][opt[i + 1]];

  const order = opt.slice(1).map((i) => i - 1); // map back to stops indices
  return { order, totalKm: Math.round(totalKm * 100) / 100, matrix: distMat };
}

// ── SIMULATION ENGINE ────────────────────────────────────
/**
 * Simulate travel along an ordered list of stops.
 *
 * @param {object[]}  stops      Ordered stops with { id, lat, lng, hora, duracao_minutos }
 * @param {object}    origin     { lat, lng }
 * @param {number}    speedKmh
 * @returns SimResult
 */
export function simulateRoute(stops, origin, speedKmh = ENGINE_CONFIG.AVG_SPEED_KMH) {
  if (!stops.length)
    return { stops: [], totalDelayMin: 0, totalKm: 0, feasible: true, maxDelay: 0 };

  const results = [];
  let prevEnd = null; // minutes since midnight when previous stop finishes
  let prevPos = origin;
  let totalKm = 0;

  // Anchor start time: departure = earliest scheduled appointment - travel from origin
  const scheduled = stops.filter((s) => s.hora).map((s) => timeToMin(s.hora));
  if (prevEnd === null && scheduled.length > 0) {
    const earliest = Math.min(...scheduled);
    const kmToFirst = haversineKm(origin, stops[0]);
    prevEnd = earliest - travelMin(kmToFirst, speedKmh) - 5; // 5-min buffer
  }
  if (prevEnd === null) {
    const now = new Date();
    prevEnd = now.getHours() * 60 + now.getMinutes();
  }

  for (const stop of stops) {
    const km = haversineKm(prevPos, stop);
    const travel = travelMin(km, speedKmh);
    const eta = prevEnd + travel;
    const scheduledMin = stop.hora ? timeToMin(stop.hora) : null;
    const dur = stop.duracao_minutos || 60;

    // Delay: how many minutes after scheduled window the team arrives
    const delay = scheduledMin !== null ? Math.max(0, eta - scheduledMin) : 0;

    results.push({
      id:           stop.id,
      eta:          minToTime(eta),
      etaMin:       Math.round(eta),
      scheduled:    stop.hora,
      scheduledMin,
      delay:        Math.round(delay),
      delayOk:      delay <= ENGINE_CONFIG.MAX_DELAY_MIN,
      idealOk:      delay <= ENGINE_CONFIG.IDEAL_DELAY_MIN,
      km:           Math.round(km * 100) / 100,
      travelMin:    Math.round(travel),
    });

    totalKm += km;
    // Next departure = ETA + service duration
    prevEnd = eta + dur;
    prevPos = stop;
  }

  const totalDelayMin = results.reduce((s, r) => s + r.delay, 0);
  const maxDelay      = Math.max(...results.map((r) => r.delay), 0);
  const feasible      = results.every((r) => r.delayOk);

  return {
    stops: results,
    totalDelayMin: Math.round(totalDelayMin),
    totalKm:       Math.round(totalKm * 100) / 100,
    feasible,
    maxDelay,
  };
}

// ── REBALANCING ENGINE ───────────────────────────────────
/**
 * Find appointments from *different* teams that are within thresholdKm of each other.
 */
function findCrossTeamGroups(teamAps, thresholdKm = ENGINE_CONFIG.SAME_REGION_KM) {
  const teams = Object.keys(teamAps);
  const groups = [];
  const seen   = new Set();

  for (let ti = 0; ti < teams.length; ti++) {
    for (let tj = ti + 1; tj < teams.length; tj++) {
      const tA = teams[ti], tB = teams[tj];
      for (const a of teamAps[tA]) {
        if (!a.lat || !a.lng) continue;
        for (const b of teamAps[tB]) {
          if (!b.lat || !b.lng) continue;
          const key = [a.id, b.id].sort().join("—");
          if (seen.has(key)) continue;
          const km = haversineKm(a, b);
          if (km <= thresholdKm) {
            seen.add(key);
            groups.push({ teamA: tA, teamB: tB, apA: a, apB: b, distKm: km });
          }
        }
      }
    }
  }
  return groups;
}

// ── SCORING ──────────────────────────────────────────────
function weightedScore(delayMin, distanceSavedKm) {
  const { delay: wD, distance: wDist } = ENGINE_CONFIG.SCORE_WEIGHTS;
  const delayScore = Math.max(0, 1 - delayMin / ENGINE_CONFIG.MAX_DELAY_MIN);
  const distScore  = Math.min(1, Math.max(0, distanceSavedKm / 15));
  return wD * delayScore + wDist * distScore;
}

// ── SUGGESTION BUILDER ───────────────────────────────────
function buildSuggestion(group, teamAps, origins) {
  const { teamA, teamB, apA, apB, distKm } = group;

  const stopsA = teamAps[teamA] || [];
  const stopsB = teamAps[teamB] || [];
  const origA  = origins[teamA];
  const origB  = origins[teamB];
  if (!origA || !origB) return null;

  // Current baselines
  const { order: oA } = optimizeRoute(stopsA, origA);
  const { order: oB } = optimizeRoute(stopsB, origB);
  const simA = simulateRoute(oA.map((i) => stopsA[i]), origA);
  const simB = simulateRoute(oB.map((i) => stopsB[i]), origB);

  // Simulate: move apB → teamA
  const newStopsA = [...stopsA, apB];
  const newStopsB = stopsB.filter((s) => s.id !== apB.id);
  const { order: newOA } = optimizeRoute(newStopsA, origA);
  const { order: newOB } = optimizeRoute(newStopsB, origB);
  const simNewA = simulateRoute(newOA.map((i) => newStopsA[i]), origA);
  const simNewB = simulateRoute(newOB.map((i) => newStopsB[i]), origB);

  const currentDelay = simA.totalDelayMin + simB.totalDelayMin;
  const newDelay     = simNewA.totalDelayMin + simNewB.totalDelayMin;
  const currentKm    = simA.totalKm + simB.totalKm;
  const newKm        = simNewA.totalKm + simNewB.totalKm;
  const distanceSaved = currentKm - newKm;

  // Find the stop result for apB in the new simA
  const apBResult = simNewA.stops.find((s) => s.id === apB.id);
  const estimatedDelay = apBResult?.delay ?? 0;

  // Classify type
  let type, suggestedTime = null;
  if (estimatedDelay === 0) {
    type = "direct";
  } else if (estimatedDelay <= ENGINE_CONFIG.MAX_DELAY_MIN) {
    type = "delay";
    suggestedTime = apBResult?.eta ?? null;
  } else {
    type = "reschedule";
    suggestedTime = apBResult?.eta ?? null;
  }

  const rawScore = weightedScore(estimatedDelay, distanceSaved);

  // Modifiers
  let confidence = rawScore;
  if (type === "direct")     confidence = Math.min(1, confidence * 1.20);
  if (type === "reschedule") confidence = confidence * 0.75;
  // Bonus: delay is actually improving
  if (newDelay < currentDelay) confidence = Math.min(1, confidence * 1.15);
  confidence = Math.round(confidence * 100) / 100;

  return {
    id:                   `${teamA}~${teamB}~${apB.id}`,
    type,
    affectedAppointments: [apA.id, apB.id],
    sourceTeam:           teamB,
    suggestedTeam:        teamA,
    appointmentToMove:    apB.id,
    suggestedTime,
    estimatedDelay,
    distanceSaved:        Math.round(distanceSaved * 100) / 100,
    distanceKm:           Math.round(distKm * 100) / 100,
    confidence,
    delayDelta:           Math.round(newDelay - currentDelay),   // negative = improvement
    // Simulation snapshots for UI
    _simBefore: { teamA: simA,    teamB: simB    },
    _simAfter:  { teamA: simNewA, teamB: simNewB },
  };
}

// ── MAIN ENGINE ──────────────────────────────────────────
/**
 * Run the full smart routing & rebalancing engine.
 *
 * @param {object[]} teams
 *   [{ id, membros: number[], pontoPartida: {lat,lng}|null, veiculo_id? }]
 *
 * @param {object[]} allAppointments
 *   [{ id, lat, lng, hora, duracao_minutos, equipe: number[], status }]
 *
 * @param {object}   options
 *   { speedKmh? }
 *
 * @returns {EngineResult}
 *   {
 *     optimizedRoutes: { [teamId]: RouteResult },
 *     suggestions:     Suggestion[],
 *     metrics:         Metrics,
 *   }
 */
export function runSmartEngine(teams, allAppointments, options = {}) {
  const { speedKmh = ENGINE_CONFIG.AVG_SPEED_KMH } = options;

  // ── 1. Bucket appointments by team ──────────────────────
  const teamAps = {};
  const origins = {};

  for (const team of teams) {
    const memberSet = new Set(team.membros || []);
    teamAps[team.id] = allAppointments.filter(
      (ag) =>
        Array.isArray(ag.equipe) &&
        ag.equipe.some((uid) => memberSet.has(uid)) &&
        ag.lat && ag.lng &&
        !["cancelado", "concluido"].includes(ag.status)
    );
    origins[team.id] = team.pontoPartida || null;
  }

  // ── 2. Optimize each team's route ─────────────────────
  const optimizedRoutes = {};

  for (const team of teams) {
    const stops  = teamAps[team.id];
    const origin = origins[team.id] ?? (stops[0] ? { lat: stops[0].lat, lng: stops[0].lng } : null);

    if (!origin || stops.length === 0) {
      optimizedRoutes[team.id] = {
        order: [], stops: [],
        simulation: { stops: [], totalDelayMin: 0, totalKm: 0, feasible: true, maxDelay: 0 },
        totalKm: 0, totalDelayMin: 0,
      };
      continue;
    }

    // Se todos os agendamentos têm horário definido, respeitar a ordem cronológica
    // em vez de aplicar 2-opt geográfico (que ignora os horários agendados)
    const todosComHora = stops.every((s) => s.hora);
    let orderedStops, order, totalKm;
    if (todosComHora) {
      orderedStops = [...stops].sort((a, b) => a.hora.localeCompare(b.hora));
      order = orderedStops.map((s) => stops.indexOf(s));
      totalKm = orderedStops.reduce((acc, s, i) => {
        const prev = i === 0 ? origin : orderedStops[i - 1];
        return acc + haversineKm(prev, s);
      }, 0);
    } else {
      ({ order, totalKm } = optimizeRoute(stops, origin));
      orderedStops = order.map((i) => stops[i]);
    }
    const simulation   = simulateRoute(orderedStops, origin, speedKmh);

    optimizedRoutes[team.id] = {
      order,
      stops: orderedStops,
      simulation,
      totalKm: simulation.totalKm,
      totalDelayMin: simulation.totalDelayMin,
    };
  }

  // ── 3. Cross-team proximity detection ─────────────────
  const crossGroups = findCrossTeamGroups(teamAps);

  // ── 4. Generate and score suggestions ─────────────────
  const rawSuggestions = crossGroups
    .map((g) => buildSuggestion(g, teamAps, origins))
    .filter(Boolean);

  const suggestions = rawSuggestions
    .filter((s) => s.confidence >= ENGINE_CONFIG.CONFIDENCE_THRESHOLD)
    .sort((a, b) => {
      // Primary: type priority (direct > delay > reschedule)
      const typeOrder = { direct: 0, delay: 1, reschedule: 2 };
      if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
      return b.confidence - a.confidence;
    });

  // ── 5. Aggregate metrics ───────────────────────────────
  const allSims = Object.values(optimizedRoutes).map((r) => r.simulation);
  const metrics = {
    totalDelayMin:        allSims.reduce((s, sim) => s + sim.totalDelayMin, 0),
    totalKm:              Math.round(allSims.reduce((s, sim) => s + sim.totalKm, 0) * 10) / 10,
    teamsAnalyzed:        teams.length,
    appointmentsRouted:   Object.values(teamAps).reduce((s, arr) => s + arr.length, 0),
    crossTeamGroupsFound: crossGroups.length,
    suggestionsGenerated: suggestions.length,
    feasible:             allSims.every((sim) => sim.feasible),
  };

  return { optimizedRoutes, suggestions, metrics };
}

// ── SAMPLE DATASET ───────────────────────────────────────
export const SAMPLE_DATASET = {
  teams: [
    {
      id: "team-alpha",
      membros: [1, 2],
      pontoPartida: { lat: -25.4290, lng: -49.2671 },
    },
    {
      id: "team-beta",
      membros: [3, 4],
      pontoPartida: { lat: -25.4720, lng: -49.2920 },
    },
  ],
  appointments: [
    { id: 1, lat: -25.432,  lng: -49.270,  hora: "09:00", duracao_minutos: 60,  equipe: [1, 2], status: "agendado" },
    { id: 2, lat: -25.451,  lng: -49.280,  hora: "10:30", duracao_minutos: 90,  equipe: [1, 2], status: "agendado" },
    { id: 3, lat: -25.448,  lng: -49.285,  hora: "09:30", duracao_minutos: 60,  equipe: [3, 4], status: "agendado" },
    { id: 4, lat: -25.490,  lng: -49.295,  hora: "11:00", duracao_minutos: 45,  equipe: [3, 4], status: "agendado" },
    { id: 5, lat: -25.4305, lng: -49.2715, hora: "14:00", duracao_minutos: 120, equipe: [3, 4], status: "agendado" },
  ],
};

/*
 * ── OR-TOOLS INTEGRATION CONTRACT ────────────────────────
 *
 * For production at scale (50+ appointments/day), replace the TSP heuristic
 * with a Google OR-Tools backend microservice.
 *
 * Suggested contract:
 *
 * POST /api/optimize-routes
 * Body:
 * {
 *   teams: [{ id, origin: { lat, lng } }],
 *   appointments: [{ id, lat, lng, team_id, time_window: [start_min, end_min], service_min }],
 *   config: { max_delay_min, vehicle_capacity? }
 * }
 *
 * Response:
 * {
 *   routes: [{ team_id, order: [appointment_ids], total_km, total_time_min }],
 *   unassigned: [appointment_ids],
 *   objective_value: number
 * }
 *
 * Python microservice skeleton:
 * ```python
 * from ortools.constraint_solver import routing_enums_pb2, pywrapcp
 * # Create routing model with time window constraints
 * # Use GUIDED_LOCAL_SEARCH metaheuristic for quality
 * # Return serialised JSON matching the contract above
 * ```
 */
