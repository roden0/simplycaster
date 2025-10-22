// ============================================================================
// SimplyCaster Drizzle Schema
// PostgreSQL 18 with comprehensive security, constraints, and optimization
// ============================================================================

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  inet,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  check,
  sql,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// ENUMS
// ============================================================================

export const userRoleEnum = pgEnum("user_role", ["guest", "host", "admin"]);
export const roomStatusEnum = pgEnum("room_status", [
  "waiting",
  "active",
  "recording",
  "closed",
]);
export const recordingStatusEnum = pgEnum("recording_status", [
  "recording",
  "uploading",
  "processing",
  "completed",
  "failed",
]);
export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

// ============================================================================
// TABLA: users
// ============================================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),

    // Autenticación: salt (per-user) + pepper (global, en ENV)
    passwordHash: varchar("password_hash", { length: 255 }),
    passwordSalt: varchar("password_salt", { length: 255 }),

    role: userRoleEnum("role").notNull().default("host"),
    isActive: boolean("is_active").notNull().default(true),
    emailVerified: boolean("email_verified").notNull().default(false),

    // Seguridad
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastLoginIp: inet("last_login_ip"),

    // Auditoría
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    // Índice único para email (case-insensitive, soft-delete compatible)
    emailUniqueIdx: uniqueIndex("idx_users_email_unique").on(
      sql`LOWER(${table.email})`
    ).where(sql`${table.deletedAt} IS NULL`),

    // Índices de búsqueda
    roleIdx: index("idx_users_role").on(table.role).where(
      sql`${table.deletedAt} IS NULL AND ${table.isActive} = true`
    ),
    lockedIdx: index("idx_users_locked").on(table.lockedUntil).where(
      sql`${table.lockedUntil} IS NOT NULL AND ${table.lockedUntil} > NOW()`
    ),

    // Constraints
    roleCheck: check(
      "users_role_check",
      sql`${table.role} IN ('host', 'admin')`
    ),
    emailFormatCheck: check(
      "users_email_format",
      sql`${table.email} ~* '^[^@]+@[^@]+\.[^@]+$'`
    ),
    failedAttemptsCheck: check(
      "users_failed_attempts_check",
      sql`${table.failedLoginAttempts} >= 0`
    ),
    passwordCompleteCheck: check(
      "users_password_complete",
      sql`(${table.passwordHash} IS NULL AND ${table.passwordSalt} IS NULL) OR 
           (${table.passwordHash} IS NOT NULL AND ${table.passwordSalt} IS NOT NULL)`
    ),
  })
);

// ============================================================================
// TABLA: password_reset_tokens
// ============================================================================

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenUniqueIdx: uniqueIndex("idx_password_reset_token_unique").on(
      table.tokenHash
    ).where(sql`${table.usedAt} IS NULL`),
    userIdx: index("idx_password_reset_user").on(table.userId, table.createdAt),
    cleanupIdx: index("idx_password_reset_cleanup").on(table.expiresAt).where(
      sql`${table.usedAt} IS NULL`
    ),
    expiresFutureCheck: check(
      "password_reset_expires_future",
      sql`${table.expiresAt} > ${table.createdAt}`
    ),
    usedBeforeExpiryCheck: check(
      "password_reset_used_before_expiry",
      sql`${table.usedAt} IS NULL OR ${table.usedAt} <= ${table.expiresAt}`
    ),
  })
);

// ============================================================================
// TABLA: user_invitations
// ============================================================================

export const userInvitations = pgTable(
  "user_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenUniqueIdx: uniqueIndex("idx_invitations_token_unique").on(
      table.tokenHash
    ).where(sql`${table.status} = 'pending'`),
    emailRoleUniqueIdx: uniqueIndex("idx_invitations_email_role_unique").on(
      sql`LOWER(${table.email})`,
      table.role
    ).where(sql`${table.status} = 'pending'`),
    invitedByIdx: index("idx_invitations_invited_by").on(
      table.invitedBy,
      table.createdAt
    ),
    cleanupIdx: index("idx_invitations_cleanup").on(table.expiresAt).where(
      sql`${table.status} = 'pending'`
    ),
    roleCheck: check(
      "invitation_role_check",
      sql`${table.role} IN ('host', 'admin')`
    ),
    expiresFutureCheck: check(
      "invitation_expires_future",
      sql`${table.expiresAt} > ${table.createdAt}`
    ),
    acceptedLogicCheck: check(
      "invitation_accepted_logic",
      sql`(${table.status} = 'accepted' AND ${table.acceptedAt} IS NOT NULL) OR
           (${table.status} != 'accepted' AND ${table.acceptedAt} IS NULL)`
    ),
  })
);

// ============================================================================
// TABLA: rooms
// ============================================================================

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }),
    slug: varchar("slug", { length: 255 }),
    status: roomStatusEnum("status").notNull().default("waiting"),
    maxParticipants: integer("max_participants").notNull().default(10),
    allowVideo: boolean("allow_video").notNull().default(true),
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recordingStartedAt: timestamp("recording_started_at", {
      withTimezone: true,
    }),
    recordingStoppedAt: timestamp("recording_stopped_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => ({
    slugUniqueIdx: uniqueIndex("idx_rooms_slug_unique").on(table.slug).where(
      sql`${table.slug} IS NOT NULL AND ${table.closedAt} IS NULL`
    ),
    hostActiveIdx: index("idx_rooms_host_active").on(
      table.hostId,
      table.createdAt
    ).where(sql`${table.closedAt} IS NULL`),
    statusIdx: index("idx_rooms_status").on(table.status, table.createdAt)
      .where(sql`${table.closedAt} IS NULL`),
    maxParticipantsCheck: check(
      "rooms_max_participants_range",
      sql`${table.maxParticipants} BETWEEN 1 AND 100`
    ),
    slugFormatCheck: check(
      "rooms_slug_format",
      sql`${table.slug} ~* '^[a-z0-9-]+$' OR ${table.slug} IS NULL`
    ),
    recordingLogicCheck: check(
      "rooms_recording_logic",
      sql`(${table.status} = 'recording' AND ${table.recordingStartedAt} IS NOT NULL) OR
           (${table.status} != 'recording')`
    ),
    recordingSequenceCheck: check(
      "rooms_recording_sequence",
      sql`${table.recordingStoppedAt} IS NULL OR 
           ${table.recordingStoppedAt} > ${table.recordingStartedAt}`
    ),
  })
);

// ============================================================================
// TABLA: guests
// ============================================================================

export const guests = pgTable(
  "guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }),
    accessTokenHash: varchar("access_token_hash", { length: 255 }).notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true })
      .notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    kickedAt: timestamp("kicked_at", { withTimezone: true }),
    kickedBy: uuid("kicked_by").references(() => users.id, {
      onDelete: "set null",
    }),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenUniqueIdx: uniqueIndex("idx_guests_token_unique").on(
      table.accessTokenHash
    ).where(sql`${table.leftAt} IS NULL AND ${table.kickedAt} IS NULL`),
    roomActiveIdx: index("idx_guests_room_active").on(
      table.roomId,
      table.joinedAt
    ).where(sql`${table.leftAt} IS NULL AND ${table.kickedAt} IS NULL`),
    cleanupIdx: index("idx_guests_cleanup").on(table.tokenExpiresAt).where(
      sql`${table.leftAt} IS NULL AND ${table.kickedAt} IS NULL`
    ),
    tokenExpiresFutureCheck: check(
      "guests_token_expires_future",
      sql`${table.tokenExpiresAt} > ${table.createdAt}`
    ),
    lastSeenAfterJoinCheck: check(
      "guests_last_seen_after_join",
      sql`${table.lastSeenAt} >= ${table.joinedAt}`
    ),
    mutualExclusionCheck: check(
      "guests_mutual_exclusion",
      sql`(${table.leftAt} IS NULL AND ${table.kickedAt} IS NULL) OR
           (${table.leftAt} IS NOT NULL AND ${table.kickedAt} IS NULL) OR
           (${table.leftAt} IS NULL AND ${table.kickedAt} IS NOT NULL)`
    ),
  })
);

// ============================================================================
// TABLA: recordings
// ============================================================================

export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    folderName: varchar("folder_name", { length: 255 }).notNull(),
    durationSeconds: integer("duration_seconds"),
    totalSizeBytes: bigint("total_size_bytes", { mode: "number" }),
    participantCount: integer("participant_count").notNull().default(0),
    status: recordingStatusEnum("status").notNull().default("recording"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    folderUniqueIdx: uniqueIndex("idx_recordings_folder_unique").on(
      table.folderName
    ).where(sql`${table.deletedAt} IS NULL`),
    createdByIdx: index("idx_recordings_created_by").on(
      table.createdBy,
      table.startedAt
    ).where(sql`${table.deletedAt} IS NULL`),
    statusIdx: index("idx_recordings_status").on(table.status, table.startedAt)
      .where(sql`${table.deletedAt} IS NULL`),
    durationPositiveCheck: check(
      "recordings_duration_positive",
      sql`${table.durationSeconds} IS NULL OR ${table.durationSeconds} >= 0`
    ),
    sizePositiveCheck: check(
      "recordings_size_positive",
      sql`${table.totalSizeBytes} IS NULL OR ${table.totalSizeBytes} >= 0`
    ),
    stoppedAfterStartCheck: check(
      "recordings_stopped_after_start",
      sql`${table.stoppedAt} IS NULL OR ${table.stoppedAt} > ${table.startedAt}`
    ),
    completedAfterStopCheck: check(
      "recordings_completed_after_stop",
      sql`${table.completedAt} IS NULL OR 
           (${table.stoppedAt} IS NOT NULL AND ${table.completedAt} >= ${table.stoppedAt})`
    ),
  })
);

// ============================================================================
// TABLA: recording_files
// ============================================================================

export const recordingFiles = pgTable(
  "recording_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordingId: uuid("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    filePath: text("file_path").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull().default(
      "audio/webm",
    ),
    participantId: uuid("participant_id"),
    participantName: varchar("participant_name", { length: 100 }).notNull(),
    participantType: varchar("participant_type", { length: 10 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    durationSeconds: integer("duration_seconds"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    recordingIdx: index("idx_recording_files_recording").on(
      table.recordingId,
      table.uploadedAt
    ).where(sql`${table.deletedAt} IS NULL`),
    participantIdx: index("idx_recording_files_participant").on(
      table.participantId
    ).where(sql`${table.deletedAt} IS NULL AND ${table.participantId} IS NOT NULL`),
    pathUniquePerRecording: uniqueIndex(
      "recording_files_path_unique_per_recording"
    ).on(table.recordingId, table.filePath),
    sizePositiveCheck: check(
      "recording_files_size_positive",
      sql`${table.sizeBytes} > 0`
    ),
    participantTypeCheck: check(
      "recording_files_participant_type_check",
      sql`${table.participantType} IN ('guest', 'host')`
    ),
  })
);

// ============================================================================
// TABLA: feed_episodes
// ============================================================================

export const feedEpisodes = pgTable(
  "feed_episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    slug: varchar("slug", { length: 255 }).notNull(),
    audioFilePath: text("audio_file_path").notNull(),
    audioMimeType: varchar("audio_mime_type", { length: 100 })
      .notNull()
      .default("audio/mpeg"),
    audioSizeBytes: bigint("audio_size_bytes", { mode: "number" }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    episodeNumber: integer("episode_number"),
    seasonNumber: integer("season_number"),
    explicit: boolean("explicit").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    isPublished: boolean("is_published").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    slugUniqueIdx: uniqueIndex("idx_feed_episodes_slug_unique").on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
    publishedIdx: index("idx_feed_episodes_published").on(table.publishedAt)
      .where(
        sql`${table.isPublished} = true AND ${table.deletedAt} IS NULL`
      ),
    createdByIdx: index("idx_feed_episodes_created_by").on(
      table.createdBy,
      table.createdAt
    ).where(sql`${table.deletedAt} IS NULL`),
    slugFormatCheck: check(
      "feed_episodes_slug_format",
      sql`${table.slug} ~* '^[a-z0-9-]+$'`
    ),
    durationPositiveCheck: check(
      "feed_episodes_duration_positive",
      sql`${table.durationSeconds} > 0`
    ),
    sizePositiveCheck: check(
      "feed_episodes_size_positive",
      sql`${table.audioSizeBytes} > 0`
    ),
    publishedLogicCheck: check(
      "feed_episodes_published_logic",
      sql`(${table.isPublished} = true AND ${table.publishedAt} IS NOT NULL) OR
           (${table.isPublished} = false)`
    ),
  })
);

// ============================================================================
// TABLA: audit_log
// ============================================================================

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    userEmail: varchar("user_email", { length: 255 }).notNull(),
    userRole: userRoleEnum("user_role").notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: uuid("entity_id"),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_audit_user").on(table.userId, table.createdAt),
    actionIdx: index("idx_audit_action").on(table.action, table.createdAt),
    entityIdx: index("idx_audit_entity").on(table.entityType, table.entityId),
    createdIdx: index("idx_audit_created").on(table.createdAt),
    metadataIdx: index("idx_audit_metadata").on(table.metadata).where(
      sql`${table.metadata} IS NOT NULL`
    ),
  })
);

// ============================================================================
// RELACIONES
// ============================================================================

export const usersRelations = relations(users, ({ many, one }) => ({
  createdRooms: many(rooms, { relationName: "host" }),
  createdRecordings: many(recordings),
  createdEpisodes: many(feedEpisodes),
  sentInvitations: many(userInvitations),
  invitedGuests: many(guests, { relationName: "inviter" }),
  kickedGuests: many(guests, { relationName: "kicker" }),
  auditLogs: many(auditLog),
  createdBy: one(users, {
    fields: [users.createdBy],
    references: [users.id],
  }),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  host: one(users, {
    fields: [rooms.hostId],
    references: [users.id],
    relationName: "host",
  }),
  guests: many(guests),
  recordings: many(recordings),
}));

export const guestsRelations = relations(guests, ({ one }) => ({
  room: one(rooms, {
    fields: [guests.roomId],
    references: [rooms.id],
  }),
  invitedBy: one(users, {
    fields: [guests.invitedBy],
    references: [users.id],
    relationName: "inviter",
  }),
  kickedBy: one(users, {
    fields: [guests.kickedBy],
    references: [users.id],
    relationName: "kicker",
  }),
}));

export const recordingsRelations = relations(recordings, ({ one, many }) => ({
  room: one(rooms, {
    fields: [recordings.roomId],
    references: [rooms.id],
  }),
  createdBy: one(users, {
    fields: [recordings.createdBy],
    references: [users.id],
  }),
  files: many(recordingFiles),
}));

export const recordingFilesRelations = relations(recordingFiles, ({ one }) => ({
  recording: one(recordings, {
    fields: [recordingFiles.recordingId],
    references: [recordings.id],
  }),
}));

export const feedEpisodesRelations = relations(feedEpisodes, ({ one }) => ({
  createdBy: one(users, {
    fields: [feedEpisodes.createdBy],
    references: [users.id],
  }),
}));

export const userInvitationsRelations = relations(userInvitations, ({ one }) => ({
  invitedBy: one(users, {
    fields: [userInvitations.invitedBy],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  })
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// TIPOS INFERIDOS
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;

export type Guest = typeof guests.$inferSelect;
export type NewGuest = typeof guests.$inferInsert;

export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;

export type RecordingFile = typeof recordingFiles.$inferSelect;
export type NewRecordingFile = typeof recordingFiles.$inferInsert;

export type FeedEpisode = typeof feedEpisodes.$inferSelect;
export type NewFeedEpisode = typeof feedEpisodes.$inferInsert;

export type UserInvitation = typeof userInvitations.$inferSelect;
export type NewUserInvitation = typeof userInvitations.$inferInsert;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;