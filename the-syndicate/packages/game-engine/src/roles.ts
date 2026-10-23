// Secret roles, abilities, suspicion, accusations and hidden objectives (rules 2.0.0+).
// Every rule here is specified in docs/RULES.md section "Roles"; the numbers come
// from the rules config so balance changes never require code changes.
import { rngFor } from './rng';
import type { RoleDefinition, RulesConfig } from './rules';
import type {
  AbilityUse,
  Archetype,
  GameState,
  IntelReport,
  LogEntry,
  ObjectiveId,
  OperationResult,
  PlayerState,
  RoleReveal,
} from './types';

export type Fail = (
  code:
    | 'INVALID_COMMAND'
    | 'NOT_ALLOWED_IN_PHASE'
    | 'LIMIT_REACHED'
    | 'UNKNOWN_TARGET'
    | 'ALREADY_DONE',
  message: string,
) => never;
type Log = (kind: LogEntry['kind'], data: LogEntry['data'], to?: string[]) => void;

export function hasRoles(rules: RulesConfig): boolean {
  return rules.roles !== undefined;
}

export function roleOf(rules: RulesConfig, player: PlayerState): RoleDefinition | null {
  return player.role ? (rules.roles?.definitions[player.role] ?? null) : null;
}

export function archetypeOf(rules: RulesConfig, player: PlayerState): Archetype | null {
  return roleOf(rules, player)?.archetype ?? null;
}

function num(def: RoleDefinition, key: string): number {
  const value = def.params[key];
  if (typeof value !== 'number') throw new Error(`role ${def.name} missing numeric param ${key}`);
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Deals roles and objectives for a starting match. Returns the role ids in seat order. */
export function assignRoles(state: GameState, rules: RulesConfig): void {
  const roles = rules.roles;
  if (!roles) {
    for (const p of state.players) Object.assign(p, { role: null, objective: null, charges: 0 });
    return;
  }
  const n = state.players.length;
  const table = roles.distribution[String(n)];
  if (!table) throw new Error(`No role distribution for ${n} players`);
  const rng = rngFor(state.seed, 'roles');
  const extras = rng.shuffle(table.from).slice(0, table.pick);
  const deck = rng.shuffle([...table.fixed, ...extras]);
  if (deck.length !== n)
    throw new Error(`Role distribution for ${n} players yields ${deck.length} roles`);
  const objectiveRules = rules.objectives ?? [];
  const objRng = rngFor(state.seed, 'objectives');
  let pool: ObjectiveId[] = [];
  state.players.forEach((p, i) => {
    const id = deck[i] as string;
    const def = roles.definitions[id];
    if (!def) throw new Error(`Unknown role ${id}`);
    if (pool.length === 0) pool = objRng.shuffle(objectiveRules.map((o) => o.id));
    p.role = id;
    p.charges = def.charges;
    p.objective = pool.pop() ?? null;
    p.accusationsMade = 0;
    p.accusedInRound = 0;
  });
}

export interface AbilityRequest {
  target?: string | undefined;
  choice?: string | undefined;
  targetRound?: number | undefined;
}

/** Validates and records an ability use. Immediate effects (peek, investigate) apply now. */
export function useAbility(
  state: GameState,
  rules: RulesConfig,
  me: PlayerState,
  req: AbilityRequest,
  fail: Fail,
  log: Log,
): void {
  const def = roleOf(rules, me);
  if (!def) return fail('NOT_ALLOWED_IN_PHASE', 'You have no special ability.');
  if (me.charges <= 0) return fail('LIMIT_REACHED', 'Your ability is used up.');
  if (state.abilityUses.some((u) => u.player === me.id && u.round === state.round)) {
    return fail('LIMIT_REACHED', 'You can use your ability once per operation.');
  }
  const phase = state.phase;
  const early = phase === 'INTELLIGENCE' || phase === 'NEGOTIATION';
  const commit = phase === 'COMMITMENT';
  if (commit && state.commitments[state.round]?.[me.id] !== undefined) {
    return fail('ALREADY_DONE', 'Use your ability before sealing your commitment.');
  }
  const use: AbilityUse = {
    round: state.round,
    player: me.id,
    ability: def.ability,
    target: null,
    choice: null,
    targetRound: null,
    effect: null,
    checks: 0,
    exposed: false,
  };
  const op = state.operations[state.round - 1];
  switch (def.ability) {
    case 'peek': {
      if (!early) return fail('NOT_ALLOWED_IN_PHASE', 'Peek during intelligence or negotiation.');
      const choice = req.choice === 'next' ? 'next' : req.choice === 'current' ? 'current' : null;
      if (!choice) return fail('INVALID_COMMAND', 'Choose the current or the next operation.');
      if (choice === 'next' && !num(def, 'allowNext'))
        return fail('INVALID_COMMAND', 'You can only read the current operation.');
      if (choice === 'current' && !num(def, 'allowCurrent'))
        return fail('INVALID_COMMAND', 'You can only read the next operation.');
      const targetRound = choice === 'next' ? state.round + 1 : state.round;
      const target = state.operations[targetRound - 1];
      if (!target) return fail('INVALID_COMMAND', 'There is no next operation.');
      const noise = num(def, choice === 'next' ? 'noiseNext' : 'noiseCurrent');
      const u = rngFor(state.seed, 'peek', state.round, me.id).next();
      const estimate = round2(
        Math.min(1, Math.max(0, Math.round((target.trueBase + (u * 2 - 1) * noise) / 0.05) * 0.05)),
      );
      const report: IntelReport = {
        targetRound,
        receivedRound: state.round,
        source: 'insider',
        estimate,
        margin: round2(noise + 0.025),
      };
      me.intel.push(report);
      use.choice = choice;
      use.targetRound = targetRound;
      log(
        'ability_result',
        { ability: 'peek', round: targetRound, estimate, tier: target.tier, name: target.name },
        [me.id],
      );
      break;
    }
    case 'investigate': {
      if (!early)
        return fail('NOT_ALLOWED_IN_PHASE', 'Investigate during intelligence or negotiation.');
      const target = state.players.find((p) => p.id === req.target);
      if (!target || target.id === me.id) return fail('UNKNOWN_TARGET', 'Choose another player.');
      // 'history' checks every resolved operation; 'round' checks one chosen operation.
      const history = def.params.scope === 'history';
      const r = history ? 0 : req.targetRound;
      if (state.round < 2) return fail('INVALID_COMMAND', 'Nothing has resolved yet.');
      if (!history && (!Number.isInteger(r) || (r as number) < 1 || (r as number) >= state.round)) {
        return fail('INVALID_COMMAND', 'Choose an operation that has already resolved.');
      }
      const theirs = state.abilityUses.filter(
        (u) => u.player === target.id && u.round < state.round && (history || u.round === r),
      );
      const signal = def.params.signal === 'sabotage';
      const result = signal ? theirs.some((u) => u.ability === 'sabotage') : theirs.length > 0;
      use.target = target.id;
      use.targetRound = history ? null : (r as number);
      use.effect = result ? 'yes' : 'no';
      log(
        'ability_result',
        {
          ability: 'investigate',
          target: target.id,
          round: history ? 0 : (r as number),
          signal: signal ? 'sabotage' : 'covert',
          result,
        },
        [me.id],
      );
      break;
    }
    case 'insure': {
      if (!commit) return fail('NOT_ALLOWED_IN_PHASE', 'Insure during the commitment phase.');
      const target = state.players.find((p) => p.id === req.target);
      if (!target) return fail('UNKNOWN_TARGET', 'Choose who to insure.');
      if (target.id === me.id && !num(def, 'allowSelf'))
        return fail('INVALID_COMMAND', 'You can only insure someone else.');
      use.target = target.id;
      break;
    }
    case 'sabotage':
    case 'broker':
      if (!commit) return fail('NOT_ALLOWED_IN_PHASE', 'Use this during the commitment phase.');
      if (!op) return fail('NOT_ALLOWED_IN_PHASE', 'No operation is active.');
      break;
    case 'forecast': {
      if (!commit) return fail('NOT_ALLOWED_IN_PHASE', 'Forecast during the commitment phase.');
      if (req.choice !== 'SUCCESS' && req.choice !== 'FAILURE')
        return fail('INVALID_COMMAND', 'Forecast success or failure.');
      use.choice = req.choice;
      break;
    }
  }
  me.charges -= 1;
  state.abilityUses.push(use);
  log('ability_used', { ability: def.ability }, [me.id]);
}

/** Total success-chance penalty from sabotage this round, capped. */
export function sabotagePenalty(state: GameState, rules: RulesConfig): number {
  const roles = rules.roles;
  if (!roles) return 0;
  let total = 0;
  for (const u of state.abilityUses) {
    if (u.round !== state.round || u.ability !== 'sabotage') continue;
    const p = state.players.find((x) => x.id === u.player);
    const def = p ? roleOf(rules, p) : null;
    if (def) total += num(def, 'penalty');
  }
  return Math.min(roles.maxSabotagePerOperation, total);
}

/** Applies ability effects that depend on the operation outcome. Runs inside resolution. */
export function applyResolutionAbilities(
  state: GameState,
  rules: RulesConfig,
  result: OperationResult,
  log: Log,
): void {
  const commits = state.commitments[state.round] ?? {};
  const committed = (id: string) => commits[id] ?? 0;
  const cap = rules.economy.creditCap;
  const give = (p: PlayerState, influence: number, source: string) => {
    if (influence <= 0) return;
    p.influence += influence;
    result.bonuses = result.bonuses ?? {};
    (result.bonuses[p.id] ??= []).push({ source, amount: influence });
    log('bonus', { source, amount: influence }, [p.id]);
  };
  for (const use of state.abilityUses) {
    if (use.round !== state.round) continue;
    const me = state.players.find((p) => p.id === use.player);
    const def = me ? roleOf(rules, me) : null;
    if (!me || !def) continue;
    switch (use.ability) {
      case 'insure': {
        const target = state.players.find((p) => p.id === use.target);
        if (!target) break;
        const lost = result.status === 'FAILURE' ? committed(target.id) : 0;
        const refund = Math.min(lost, Math.ceil(lost * num(def, 'refundShare')));
        if (refund > 0) {
          target.credits = Math.min(cap, target.credits + refund);
          const payout = result.payouts[target.id];
          if (payout) payout.insuranceRefund = refund;
        }
        use.effect = refund > 0 ? `refunded ${refund}` : 'no loss';
        log(
          'insured',
          { insurer: me.id, refund },
          target.id === me.id ? [me.id] : [me.id, target.id],
        );
        if (result.status === 'SUCCESS' && target.id !== me.id && committed(target.id) > 0) {
          give(me, num(def, 'premium'), 'premium');
        }
        break;
      }
      case 'broker': {
        const others = state.players.filter((p) => p.id !== me.id && committed(p.id) > 0);
        const ok =
          result.status === 'SUCCESS' &&
          committed(me.id) > 0 &&
          others.length >= num(def, 'minOthers');
        use.effect = ok ? 'paid' : 'not met';
        if (ok) {
          give(me, num(def, 'bonus'), 'broker');
          // Neutral label: recipients learn they were rewarded, not by which role.
          for (const p of others) give(p, num(def, 'othersBonus'), 'patron');
        }
        break;
      }
      case 'forecast': {
        if (result.status === 'ABANDONED') {
          me.charges += 1;
          use.effect = 'void';
          break;
        }
        const correct = use.choice === result.status;
        use.effect = correct ? 'correct' : 'wrong';
        if (correct) give(me, num(def, 'reward'), 'forecast');
        break;
      }
      case 'sabotage': {
        const victims = state.players.filter((p) => p.id !== me.id && committed(p.id) > 0).length;
        const ok = result.status === 'FAILURE' && victims >= num(def, 'minVictims');
        use.effect = ok ? 'paid' : 'not paid';
        if (ok) give(me, num(def, 'reward'), 'sabotage');
        break;
      }
      default:
        break;
    }
  }
  // Insider tip: backing an operation you read in advance pays when it succeeds.
  if (result.status === 'SUCCESS') {
    for (const use of state.abilityUses) {
      if (use.ability !== 'peek' || use.targetRound !== state.round) continue;
      const me = state.players.find((p) => p.id === use.player);
      const def = me ? roleOf(rules, me) : null;
      if (!me || !def || committed(me.id) <= 0) continue;
      give(me, num(def, 'tipBonus'), 'tip');
    }
  }
}

/** Round-summary checks: sabotage exposure (rising chance each check) and suspicion decay. */
export function summaryChecks(state: GameState, rules: RulesConfig, log: Log): void {
  const suspicion = rules.suspicion;
  if (!rules.roles || !suspicion) return;
  const exposedNow = new Set<string>();
  for (const use of state.abilityUses) {
    if (use.ability !== 'sabotage' || use.exposed) continue;
    const p = state.players.find((x) => x.id === use.player);
    const def = p ? roleOf(rules, p) : null;
    if (!p || !def) continue;
    const chance = Math.min(1, num(def, 'exposeBase') + num(def, 'exposeStep') * use.checks);
    const u = rngFor(state.seed, 'exposure', use.round, p.id, use.checks).next();
    use.checks += 1;
    if (u < chance) {
      use.exposed = true;
      exposedNow.add(p.id);
      p.suspicion = Math.min(suspicion.max, p.suspicion + suspicion.exposureRaise);
      log('exposed', { player: p.id, round: use.round });
    }
  }
  const op = state.operations[state.round - 1];
  if (op?.result?.status === 'SUCCESS') {
    for (const p of state.players) {
      if ((state.commitments[state.round]?.[p.id] ?? 0) > 0 && !exposedNow.has(p.id)) {
        p.suspicion = Math.max(0, p.suspicion - suspicion.decayOnSuccess);
      }
    }
  }
}

export function accuse(
  state: GameState,
  rules: RulesConfig,
  me: PlayerState,
  targetId: string,
  fail: Fail,
  log: Log,
): void {
  const a = rules.accusations;
  const suspicion = rules.suspicion;
  if (!a || !suspicion)
    return fail('NOT_ALLOWED_IN_PHASE', 'Accusations are not part of these rules.');
  const target = state.players.find((p) => p.id === targetId);
  if (!target || target.id === me.id) return fail('UNKNOWN_TARGET', 'Choose another player.');
  if (me.accusationsMade >= a.perMatch)
    return fail('LIMIT_REACHED', 'You have no accusations left.');
  // Accusing someone already exposed adds nothing: only real deductions count.
  if (state.abilityUses.some((u) => u.player === target.id && u.exposed)) {
    return fail('INVALID_COMMAND', 'That player has already been exposed.');
  }
  const thisRound = state.accusations.filter(
    (x) => x.accuser === me.id && x.round === state.round,
  ).length;
  if (thisRound >= a.perRound) return fail('LIMIT_REACHED', 'One accusation per operation.');
  me.accusationsMade += 1;
  state.accusations.push({ round: state.round, accuser: me.id, target: target.id });
  // Bounded pile-ons: accusations raise a player's suspicion at most once per round.
  if (target.accusedInRound !== state.round) {
    target.accusedInRound = state.round;
    target.suspicion = Math.min(
      suspicion.max,
      target.suspicion + suspicion.accusationRaise * suspicion.maxAccusationRaisePerRound,
    );
  }
  log('accusation', { accuser: me.id, target: target.id });
}

function influenceFromOperations(state: GameState, id: string): number {
  return state.operations.reduce((s, o) => s + (o.result?.payouts[id]?.influence ?? 0), 0);
}

export function objectiveMet(state: GameState, rules: RulesConfig, p: PlayerState): boolean {
  const rule = rules.objectives?.find((o) => o.id === p.objective);
  if (!rule) return false;
  const threshold = state.settings.length === 'quick' ? rule.quick : rule.standard;
  const ops = state.operations.filter((o) => o.result);
  const c = (round: number) => state.commitments[round]?.[p.id] ?? 0;
  switch (rule.id) {
    case 'backer':
      return ops.filter((o) => c(o.round) > 0).length >= threshold;
    case 'highRoller':
      return (
        ops.filter((o) => o.tier === 'HIGH' && o.result?.status === 'SUCCESS' && c(o.round) >= 3)
          .length >= threshold
      );
    case 'reserve':
      return p.credits >= threshold;
    case 'dealmaker': {
      const partners = new Set<string>();
      for (const d of state.deals) {
        if (d.responses[p.id] !== 'accepted') continue;
        for (const m of d.members) if (m !== p.id && d.responses[m] === 'accepted') partners.add(m);
      }
      return partners.size >= threshold;
    }
    case 'cleanHands':
      return p.suspicion <= threshold;
    case 'promiseKeeper': {
      const kept = state.deals.filter((d) => d.kept?.[p.id] === true).length;
      const broken = state.deals.filter((d) => d.kept?.[p.id] === false).length;
      return kept >= threshold && broken === 0;
    }
    case 'contrarian':
      return (
        ops.filter((o) => o.result?.status === 'FAILURE' && c(o.round) === 0).length >= threshold
      );
    case 'investor':
      return influenceFromOperations(state, p.id) >= threshold;
  }
}

/** Final-reckoning adjustments: accusation outcomes, objectives and suspicion penalties. Pure. */
export function reckon(state: GameState, rules: RulesConfig): RoleReveal[] {
  const out: RoleReveal[] = [];
  const a = rules.accusations;
  const s = rules.suspicion;
  for (const p of state.players) {
    let bonus = 0;
    let wrong = 0;
    if (a) {
      for (const acc of state.accusations.filter((x) => x.accuser === p.id)) {
        const target = state.players.find((x) => x.id === acc.target);
        if (target && archetypeOf(rules, target) === 'saboteur') {
          const def = roleOf(rules, p);
          bonus += a.correctBonus + (def?.archetype === 'auditor' ? num(def, 'accuseBonus') : 0);
        } else {
          wrong += a.wrongPenalty;
        }
      }
    }
    const suspicionPenalty = s
      ? Math.min(s.maxPenalty, Math.max(0, p.suspicion - s.freeAllowance))
      : 0;
    // Bounded ability costs: a fine for each exposed sabotage, and for each wrong forecast.
    const def = roleOf(rules, p);
    const param = (key: string) =>
      def && typeof def.params[key] === 'number' ? (def.params[key] as number) : 0;
    const mine = state.abilityUses.filter((u) => u.player === p.id);
    const abilityPenalty =
      mine.filter((u) => u.ability === 'sabotage' && u.exposed).length * param('exposureFine') +
      mine.filter((u) => u.ability === 'forecast' && u.effect === 'wrong').length *
        param('wrongPenalty');
    out.push({
      playerId: p.id,
      role: p.role,
      objective: p.objective,
      objectiveMet: objectiveMet(state, rules, p),
      accusationBonus: bonus,
      accusationPenalty: wrong,
      suspicionPenalty,
      abilityPenalty,
    });
  }
  return out;
}

export function objectiveBonus(rules: RulesConfig, reveal: RoleReveal | undefined): number {
  if (!reveal?.objectiveMet) return 0;
  return rules.objectives?.find((o) => o.id === reveal.objective)?.bonus ?? 0;
}
