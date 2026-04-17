import { z } from 'zod';

// ── Reusable field definitions ─────────────────────────────────────────────────

const nameField = z
  .string('name is required')
  .trim()
  .min(1, 'name cannot be empty')
  .max(32, 'name must be 32 characters or fewer');

const optionalPlayerId = z.string().optional();

const requiredTargetId = z
  .string('targetId is required')
  .min(1, 'targetId cannot be empty');

// ── GameSettings (partial — all fields optional on create) ────────────────────

export const GameSettingsPartialSchema = z
  .object({
    minPlayers:  z.number().int().min(2).max(20).optional(),
    maxPlayers:  z.number().int().min(2).max(20).optional(),
    mafiaRatio:  z.number().min(0.1).max(0.5).optional(),
    hasDoctor:   z.boolean().optional(),
    hasSheriff:  z.boolean().optional(),
  })
  .optional();

// ── Route body schemas ────────────────────────────────────────────────────────

export const CreateGameSchema = z.object({
  hostName: nameField,
  settings: GameSettingsPartialSchema,
});

export const JoinGameSchema = z.object({
  playerName: nameField,
});

export const SpectateSchema = z.object({
  spectatorName: nameField,
});

export const ReadySchema = z.object({
  playerId: optionalPlayerId,
});

export const StartSchema = z.object({
  playerId: optionalPlayerId,
});

export const VoteSchema = z.object({
  voterId:  optionalPlayerId,
  targetId: requiredTargetId,
});

export const ChatSchema = z.object({
  text:     z.string().min(1, 'text cannot be empty').max(200, 'message must be 200 characters or fewer'),
  playerId: optionalPlayerId,
});

export const ResolveSchema = z.object({
  playerId: optionalPlayerId,
  force:    z.boolean().optional(),
});

export const NightActionSchema = z.object({
  playerId: optionalPlayerId,
  targetId: requiredTargetId,
});

export const LeaveSchema = z.object({
  playerId: optionalPlayerId,
});
