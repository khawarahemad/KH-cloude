-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Deployment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "commitHash" TEXT,
    "commitMessage" TEXT,
    "commitAuthor" TEXT,
    "branch" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL DEFAULT 'MANUAL',
    "triggeredByName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "buildLogs" TEXT NOT NULL DEFAULT '',
    "buildDuration" INTEGER,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Deployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Deployment" ("branch", "buildDuration", "buildLogs", "commitHash", "commitMessage", "createdAt", "endedAt", "id", "projectId", "startedAt", "status") SELECT "branch", "buildDuration", "buildLogs", "commitHash", "commitMessage", "createdAt", "endedAt", "id", "projectId", "startedAt", "status" FROM "Deployment";
DROP TABLE "Deployment";
ALTER TABLE "new_Deployment" RENAME TO "Deployment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
