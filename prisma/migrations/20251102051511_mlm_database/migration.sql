-- AlterTable
ALTER TABLE `Transaction` MODIFY `type` ENUM('ADD_FUNDS', 'WITHDRAW', 'TRANSFER_INTERNAL', 'TOKEN_PURCHASE', 'COMMISSION') NOT NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `activeUntil` DATETIME(3) NULL,
    ADD COLUMN `activityStatus` ENUM('ACTIVE', 'LAPSED') NOT NULL DEFAULT 'LAPSED',
    ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `lastPlanRenewalAt` DATETIME(3) NULL,
    ADD COLUMN `matrixLevel` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `parentId` VARCHAR(191) NULL,
    ADD COLUMN `path` VARCHAR(512) NULL,
    ADD COLUMN `positionIndex` INTEGER NULL,
    ADD COLUMN `qualificationLevel` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `sponsorId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `AvailablePosition` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `depth` INTEGER NOT NULL,
    `childCount` INTEGER NOT NULL DEFAULT 0,
    `path` VARCHAR(512) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AvailablePosition_userId_key`(`userId`),
    INDEX `AvailablePosition_depth_createdAt_idx`(`depth`, `createdAt`),
    INDEX `AvailablePosition_createdAt_id_idx`(`createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommissionSetting` (
    `level` INTEGER NOT NULL,
    `percent` DECIMAL(5, 2) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`level`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommissionHistory` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sourceUserId` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `status` ENUM('PAID', 'SKIPPED') NOT NULL,
    `reason` VARCHAR(191) NULL,
    `walletTransactionId` VARCHAR(191) NULL,
    `eventRef` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CommissionHistory_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `CommissionHistory_sourceUserId_createdAt_idx`(`sourceUserId`, `createdAt`),
    UNIQUE INDEX `CommissionHistory_eventRef_userId_key`(`eventRef`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LevelQualificationHistory` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `status` ENUM('QUALIFIED', 'REVOKED') NOT NULL,
    `qualifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LevelQualificationHistory_userId_level_idx`(`userId`, `level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityHistory` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `period` DATETIME(3) NOT NULL,
    `status` ENUM('ACTIVE', 'LAPSED') NOT NULL,
    `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityHistory_status_period_idx`(`status`, `period`),
    UNIQUE INDEX `ActivityHistory_userId_period_key`(`userId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `User_sponsorId_idx` ON `User`(`sponsorId`);

-- CreateIndex
CREATE INDEX `User_parentId_idx` ON `User`(`parentId`);

-- CreateIndex
CREATE INDEX `User_path_idx` ON `User`(`path`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_sponsorId_fkey` FOREIGN KEY (`sponsorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AvailablePosition` ADD CONSTRAINT `AvailablePosition_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommissionHistory` ADD CONSTRAINT `CommissionHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommissionHistory` ADD CONSTRAINT `CommissionHistory_sourceUserId_fkey` FOREIGN KEY (`sourceUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LevelQualificationHistory` ADD CONSTRAINT `LevelQualificationHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityHistory` ADD CONSTRAINT `ActivityHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
