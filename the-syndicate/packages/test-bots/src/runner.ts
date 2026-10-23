import {
  applyCommand,
  checkInvariants,
  createGame,
  redactViewForPlayer,
  rngFor,
  type CommandEnvelope,
  type GameState,
  type MatchSettings,
  type Phase,
  type PlayerCommand,
} from '@syndicate/game-engine';
import { botCommands, type StrategyName } from './strategies';

export interface SimConfig {
  seed: string;
  strategies: StrategyName[];
  settings?: Partial<MatchSettings>;
  /** Probability that a bot is disconnected for a whole phase (exercises auto-pass). */
  dropoutRate?: number;
}

export interface SimResult {
  seed: string;
  state: GameState;
  strategies: StrategyName[];
  commands: CommandEnvelope[];
  rejected: number;
  /** Rejections of commands that should have been accepted (bot bugs or engine bugs). */
  unexpectedRejections: string[];
  violations: string[];
  /** Standings (by total score) after round 2, for comeback analysis. */
  standingsAfterRound2: string[];
  /** Commitment decisions where the player could only commit 0 (no credits). */
  forcedZero: number;
  decisions: number;
  phasesSeen: Phase[];
}

/** Runs one complete match between bots, driving simulated time through every phase. */
export function simulateMatch(config: SimConfig): SimResult {
  const n = config.strategies.length;
  const ids = config.strategies.map((_, i) => `p${i + 1}`);
  let now = 1_700_000_000_000;
  let state = createGame(
    {
      hostId: ids[0] as string,
      hostName: 'Bot 1',
      hostAvatar: 'fox',
      now,
      settings: config.settings ?? {},
    },
    config.seed,
  );
  const commands: CommandEnvelope[] = [];
  const violations: string[] = [];
  const unexpectedRejections: string[] = [];
  const phasesSeen: Phase[] = [];
  let rejected = 0;
  let forcedZero = 0;
  let decisions = 0;
  let standingsAfterRound2: string[] = [];
  const memories = ids.map(() => ({}) as Record<string, unknown>);

  const send = (env: CommandEnvelope, expectOk: boolean): boolean => {
    commands.push(env);
    const result = applyCommand(state, env);
    if (!result.ok) {
      rejected++;
      if (expectOk)
        unexpectedRejections.push(
          `${env.command.type}: ${result.error.code} ${result.error.message}`,
        );
      return false;
    }
    violations.push(...checkInvariants(state, result.state));
    if (result.state.phase !== state.phase) phasesSeen.push(result.state.phase);
    state = result.state;
    return true;
  };

  for (let i = 1; i < n; i++) {
    send(
      {
        actor: 'system',
        now,
        command: { type: 'join', playerId: ids[i] as string, name: `Bot ${i + 1}`, avatar: 'owl' },
      },
      true,
    );
  }
  for (const id of ids.slice(1))
    send({ actor: id, now, command: { type: 'setReady', ready: true } }, true);
  send({ actor: ids[0] as string, now, command: { type: 'start' }, seed: config.seed }, true);

  const dropRng = rngFor(config.seed, 'sim-dropout');
  let guard = 0;
  while (state.phase !== 'RESULTS' && guard++ < 500) {
    const phaseVersion = state.phaseVersion;
    const phase = state.phase;
    // Random disconnects for this phase.
    if (config.dropoutRate && phase === 'INTELLIGENCE') {
      for (const id of ids) {
        const connected = dropRng.next() >= config.dropoutRate;
        send(
          { actor: 'system', now, command: { type: 'presence', playerId: id, connected } },
          true,
        );
      }
    }
    now += 1000;
    ids.forEach((id, i) => {
      if (state.phaseVersion !== phaseVersion) return;
      const me = state.players.find((p) => p.id === id);
      if (!me?.connected) return;
      const strategy = config.strategies[i] as StrategyName;
      const view = redactViewForPlayer(state, id);
      const rng = rngFor(config.seed, 'bot', id, state.phaseVersion);
      const cmds: PlayerCommand[] = botCommands(strategy, {
        view,
        rng,
        memory: memories[i] as Record<string, unknown>,
      });
      if (phase === 'COMMITMENT') {
        decisions++;
        if (view.self.maxCommit === 0) forcedZero++;
      }
      for (const command of cmds) {
        if (state.phaseVersion !== phaseVersion) break;
        // Exploit probes and the random bot's guesses may be refused; everyone else must be legal.
        const expectOk = strategy !== 'exploiter' && strategy !== 'random';
        send({ actor: id, now, command }, expectOk);
      }
      if (state.phaseVersion === phaseVersion && phase !== 'COMMITMENT') {
        send({ actor: id, now, command: { type: 'setReady', ready: true } }, true);
      }
    });
    if (state.phase === 'ROUND_SUMMARY' && state.round === 2 && standingsAfterRound2.length === 0) {
      standingsAfterRound2 = [...state.players]
        .sort((a, b) => b.influence - a.influence)
        .map((p) => p.id);
    }
    if (state.phaseVersion === phaseVersion) {
      // Nobody finished early (for example, disconnected players): let the deadline pass.
      now = Math.max(now, state.phaseEndsAt ?? now) + 1;
      send({ actor: 'system', now, command: { type: 'tick' } }, true);
    }
  }
  if (state.phase !== 'RESULTS') violations.push(`match did not finish (phase ${state.phase})`);
  return {
    seed: config.seed,
    state,
    strategies: config.strategies,
    commands,
    rejected,
    unexpectedRejections,
    violations,
    standingsAfterRound2,
    forcedZero,
    decisions,
    phasesSeen,
  };
}
