-- DropForeignKey
ALTER TABLE `LevelQualificationHistory` DROP FOREIGN KEY `LevelQualificationHistory_userId_fkey`;

-- DropIndex
ALTER TABLE `LevelQualificationHistory` DROP INDEX `LevelQualificationHistory_userId_level_idx`;

-- CreateIndex
CREATE INDEX `LevelQualificationHistory_userId_level_idx` ON `LevelQualificationHistory`(`userId`(64), `level`);

-- AddForeignKey
ALTER TABLE `LevelQualificationHistory`
    ADD CONSTRAINT `LevelQualificationHistory_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
