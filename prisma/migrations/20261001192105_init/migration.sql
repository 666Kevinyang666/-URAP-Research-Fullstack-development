-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "updatedAt" DATETIME NOT NULL,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Draft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("sessionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Snapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("sessionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "taskId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionId_key" ON "Session"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_sessionId_taskId_key" ON "Draft"("sessionId", "taskId");

-- CreateIndex
CREATE INDEX "Snapshot_sessionId_taskId_idx" ON "Snapshot"("sessionId", "taskId");

-- CreateIndex
CREATE INDEX "Event_sessionId_timestamp_idx" ON "Event"("sessionId", "timestamp");

-- Event is an append-only log: reject any UPDATE or DELETE.
CREATE TRIGGER "Event_no_update" BEFORE UPDATE ON "Event"
BEGIN
    SELECT RAISE(ABORT, 'Event is append-only');
END;

CREATE TRIGGER "Event_no_delete" BEFORE DELETE ON "Event"
BEGIN
    SELECT RAISE(ABORT, 'Event is append-only');
END;
