import { v4 as uuidv4 } from 'uuid';
import { Player } from './Player';
import {
  GamePhase,
  GameStatus,
  GameState,
  GameSettings,
  Role
} from './types';

const DEFAULT_SETTINGS: GameSettings = {
  minPlayers: 4,
  maxPlayers: 12,
  mafiaRatio: 0.25,
  hasDoctor: true,
  hasSheriff: true
};

export class Game {
  readonly id: string;
  readonly hostId: string;
  private players: Map<string, Player>;
  private phase: GamePhase;
  private status: GameStatus;
  private round: number;
  private winner?: 'mafia' | 'town';
  private votes: Map<string, string>;
  private nightActions: Map<string, string>;
  private eliminatedThisRound?: string;
  private savedThisRound?: string;
  private investigatedThisRound?: { target: string; result: Role } | null;
  readonly settings: GameSettings;
  private readonly createdAt: number;
  private updatedAt: number;

  constructor(hostId: string, settings?: Partial<GameSettings>) {
    this.id = uuidv4();
    this.hostId = hostId;
    this.players = new Map();
    this.phase = 'lobby';
    this.status = 'waiting';
    this.round = 0;
    this.votes = new Map();
    this.nightActions = new Map();
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }

  getCreatedAt(): number {
    return this.createdAt;
  }

  getUpdatedAt(): number {
    return this.updatedAt;
  }

  // ── Player management ──────────────────────────────────────────────────────

  addPlayer(player: Player): void {
    if (this.status !== 'waiting') {
      throw new Error('Cannot join a game that has already started');
    }
    if (this.players.size >= this.settings.maxPlayers) {
      throw new Error('Game is full');
    }
    if ([...this.players.values()].some(p => p.name === player.name)) {
      throw new Error('Player name already taken');
    }
    this.players.set(player.id, player);
    this.touch();
  }

  removePlayer(playerId: string): void {
    if (this.players.delete(playerId)) {
      this.votes.delete(playerId);
      this.nightActions.delete(playerId);
      this.touch();
    }
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  getPlayers(): Player[] {
    return [...this.players.values()];
  }

  getAlivePlayers(): Player[] {
    return this.getPlayers().filter(p => p.isAlive);
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  // ── Ready status ───────────────────────────────────────────────────────────

  markPlayerReady(playerId: string): void {
    if (this.status !== 'waiting') {
      throw new Error('Cannot change ready status after game has started');
    }
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    player.markReady();
    this.touch();
  }

  markPlayerNotReady(playerId: string): void {
    if (this.status !== 'waiting') {
      throw new Error('Cannot change ready status after game has started');
    }
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    player.markNotReady();
    this.touch();
  }

  getReadyCount(): number {
    return this.getPlayers().filter(p => p.isReady).length;
  }

  areAllPlayersReady(): boolean {
    const players = this.getPlayers();
    return players.length >= this.settings.minPlayers &&
      players.every(p => p.isReady);
  }

  // ── Game lifecycle ─────────────────────────────────────────────────────────

  getPhase(): GamePhase {
    return this.phase;
  }

  getStatus(): GameStatus {
    return this.status;
  }

  getRound(): number {
    return this.round;
  }

  getWinner(): 'mafia' | 'town' | undefined {
    return this.winner;
  }

  start(): void {
    if (this.status !== 'waiting') {
      throw new Error('Game has already started');
    }
    if (this.players.size < this.settings.minPlayers) {
      throw new Error(
        `Need at least ${this.settings.minPlayers} players to start`
      );
    }
    this.assignRoles();
    this.status = 'active';
    this.phase = 'night';
    this.round = 0;
    this.touch();
  }

  private assignRoles(): void {
    const players = [...this.players.values()];
    const shuffled = this.shufflePlayers(players);
    const mafiaCount = Math.max(
      1,
      Math.floor(shuffled.length * this.settings.mafiaRatio)
    );

    let roleIndex = 0;

    for (let i = 0; i < mafiaCount; i++) {
      shuffled[roleIndex++].assignRole('mafia');
    }

    if (this.settings.hasDoctor && roleIndex < shuffled.length) {
      shuffled[roleIndex++].assignRole('doctor');
    }

    if (this.settings.hasSheriff && roleIndex < shuffled.length) {
      shuffled[roleIndex++].assignRole('sheriff');
    }

    for (let i = roleIndex; i < shuffled.length; i++) {
      shuffled[i].assignRole('townsperson');
    }
  }

  private shufflePlayers(players: Player[]): Player[] {
    const arr = [...players];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── Day phase ──────────────────────────────────────────────────────────────

  castVote(voterId: string, targetId: string): void {
    if (this.phase !== 'day') {
      throw new Error('Voting is only allowed during the day phase');
    }
    const voter = this.players.get(voterId);
    const target = this.players.get(targetId);
    if (!voter || !voter.isAlive) {
      throw new Error('Voter is not a valid alive player');
    }
    if (!target || !target.isAlive) {
      throw new Error('Target is not a valid alive player');
    }
    if (voterId === targetId) {
      throw new Error('Cannot vote for yourself');
    }
    this.votes.set(voterId, targetId);
    this.touch();
  }

  getAliveVoterIds(): string[] {
    return this.getAlivePlayers().map(p => p.id);
  }

  getMissingVotePlayerIds(): string[] {
    const aliveVoterIds = this.getAliveVoterIds();
    return aliveVoterIds.filter(id => !this.votes.has(id));
  }

  hasAllRequiredVotes(): boolean {
    return this.getMissingVotePlayerIds().length === 0;
  }

  resolveVotes(): string | null {
    if (this.phase !== 'day') {
      throw new Error('Can only resolve votes during day phase');
    }

    const voteCounts = new Map<string, number>();
    for (const targetId of this.votes.values()) {
      voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
    }

    if (voteCounts.size === 0) {
      return null;
    }

    let maxVotes = 0;
    let topTargets: string[] = [];
    for (const [playerId, count] of voteCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        topTargets = [playerId];
      } else if (count === maxVotes) {
        topTargets.push(playerId);
      }
    }

    // Explicit tie rule: if two or more players tie for top votes, no one is eliminated.
    if (topTargets.length !== 1) {
      this.votes.clear();
      this.touch();
      return null;
    }

    const eliminated = topTargets[0];
    const player = this.players.get(eliminated);
    if (player) {
      player.eliminate();
      this.eliminatedThisRound = eliminated;
      this.touch();
    }

    this.votes.clear();
    return eliminated;
  }

  // ── Night phase ────────────────────────────────────────────────────────────

  submitNightAction(playerId: string, targetId: string): void {
    if (this.phase !== 'night') {
      throw new Error('Night actions are only allowed during the night phase');
    }
    const player = this.players.get(playerId);
    const target = this.players.get(targetId);
    if (!player || !player.isAlive) {
      throw new Error('Actor is not a valid alive player');
    }
    if (!target || !target.isAlive) {
      throw new Error('Target is not a valid alive player');
    }
    if (player.role !== 'mafia' && player.role !== 'doctor' && player.role !== 'sheriff') {
      throw new Error('Player does not have a night action');
    }
    this.nightActions.set(playerId, targetId);
    this.touch();
  }

  getNightActionActorIds(): string[] {
    return this.getAlivePlayers()
      .filter(p => p.role === 'mafia' || p.role === 'doctor' || p.role === 'sheriff')
      .map(p => p.id);
  }

  getMissingNightActionPlayerIds(): string[] {
    return this.getNightActionActorIds().filter(id => !this.nightActions.has(id));
  }

  hasAllRequiredNightActions(): boolean {
    return this.getMissingNightActionPlayerIds().length === 0;
  }

  resolveNightActions(): string | null {
    if (this.phase !== 'night') {
      throw new Error('Can only resolve night actions during night phase');
    }

    const mafiaVoteCounts = new Map<string, number>();
    let doctorTarget: string | undefined;
    let sheriffActor: string | undefined;
    let sheriffTarget: string | undefined;

    for (const [actorId, targetId] of this.nightActions) {
      const actor = this.players.get(actorId);
      if (!actor) continue;

      if (actor.role === 'mafia') {
        mafiaVoteCounts.set(targetId, (mafiaVoteCounts.get(targetId) ?? 0) + 1);
      } else if (actor.role === 'doctor') {
        doctorTarget = targetId;
      } else if (actor.role === 'sheriff') {
        sheriffActor = actorId;
        sheriffTarget = targetId;
      }
    }

    this.savedThisRound = undefined;
    this.investigatedThisRound = null;

    if (sheriffTarget && sheriffActor) {
      const target = this.players.get(sheriffTarget);
      if (target) {
        this.investigatedThisRound = {
          target: sheriffTarget,
          result: target.role ?? 'townsperson'
        };
      }
    }

    let mafiaTarget: string | undefined;
    if (mafiaVoteCounts.size > 0) {
      let maxVotes = 0;
      let topTargets: string[] = [];
      for (const [targetId, count] of mafiaVoteCounts) {
        if (count > maxVotes) {
          maxVotes = count;
          topTargets = [targetId];
        } else if (count === maxVotes) {
          topTargets.push(targetId);
        }
      }

      if (topTargets.length === 1) {
        mafiaTarget = topTargets[0];
      }
    }

    let eliminated: string | null = null;
    if (mafiaTarget) {
      if (mafiaTarget === doctorTarget) {
        this.savedThisRound = mafiaTarget;
      } else {
        const target = this.players.get(mafiaTarget);
        if (target && target.isAlive) {
          target.eliminate();
          eliminated = mafiaTarget;
          this.eliminatedThisRound = mafiaTarget;
        }
      }
    }

    this.nightActions.clear();
    this.touch();
    return eliminated;
  }

  // ── Phase management ───────────────────────────────────────────────────────

  advancePhase(): void {
    if (this.status !== 'active') {
      throw new Error('Game is not active');
    }
    this.eliminatedThisRound = undefined;

    if (this.phase === 'day') {
      this.phase = 'night';
    } else if (this.phase === 'night') {
      this.phase = 'day';
      this.round++;
    }

    this.touch();
  }

  // ── Win condition ──────────────────────────────────────────────────────────

  checkWinCondition(): 'mafia' | 'town' | null {
    const alive = this.getAlivePlayers();
    const aliveMafia = alive.filter(p => p.role === 'mafia');
    const aliveTown = alive.filter(p => p.role !== 'mafia');

    if (aliveMafia.length === 0) {
      this.winner = 'town';
      this.status = 'ended';
      this.phase = 'ended';
      this.touch();
      return 'town';
    }

    if (aliveMafia.length >= aliveTown.length) {
      this.winner = 'mafia';
      this.status = 'ended';
      this.phase = 'ended';
      this.touch();
      return 'mafia';
    }

    return null;
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  getVotes(): Record<string, string> {
    return Object.fromEntries(this.votes);
  }

  getNightActions(): Record<string, string> {
    return Object.fromEntries(this.nightActions);
  }

  toState(forPlayerId?: string): GameState {
    const requestingPlayer = forPlayerId ? this.players.get(forPlayerId) : undefined;
    const requestorIsMafia = requestingPlayer?.role === 'mafia';

    const players = this.getPlayers().map(p => {
      if (!forPlayerId) return p.toPublicData();
      if (p.id === forPlayerId) return p.toData();
      if (this.status === 'ended') return p.toData();
      if (requestorIsMafia && p.role === 'mafia') return p.toData();
      return p.toPublicData();
    });

    return {
      id: this.id,
      phase: this.phase,
      status: this.status,
      players,
      round: this.round,
      winner: this.winner,
      hostId: this.hostId,
      votes: this.getVotes(),
      nightActions: {},
      eliminatedThisRound: this.eliminatedThisRound,
      savedThisRound: this.savedThisRound,
      investigatedThisRound: this.investigatedThisRound,
      settings: this.settings,
      readyCount: this.getReadyCount()
    };
  }
}
