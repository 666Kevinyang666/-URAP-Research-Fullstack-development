-- CreateTable
CREATE TABLE "TaskPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "goodEnough" TEXT NOT NULL,
    "timeBudgetMinutes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskPlan_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("sessionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskActiveTime" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "activeMs" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskActiveTime_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("sessionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskPlan_sessionId_taskId_key" ON "TaskPlan"("sessionId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskActiveTime_sessionId_taskId_key" ON "TaskActiveTime"("sessionId", "taskId");
