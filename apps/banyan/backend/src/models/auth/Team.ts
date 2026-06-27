import mongoose, { Schema, Document } from 'mongoose'
import type { ITeam } from '../types/index.js'

type ITeamDoc = ITeam & Document

// ─── Schema ───────────────────────────────────────────────────────────────────

const TeamSchema = new Schema<ITeamDoc>(
  {
    teamId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
    planId: { type: String },
    subscriptionExpiresAt: { type: Date },
  },
  { timestamps: true, collection: 'teams' },
)

TeamSchema.index({ planId: 1 })

export const Team = mongoose.model<ITeamDoc>('Team', TeamSchema)
