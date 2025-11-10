-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_sponsorId_fkey`;

-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_parentId_fkey`;

-- DropIndex
ALTER TABLE `User` DROP INDEX `User_sponsorId_idx`;

-- DropIndex
ALTER TABLE `User` DROP INDEX `User_parentId_idx`;

-- CreateIndex
CREATE INDEX `User_sponsorId_idx` ON `User`(`sponsorId`(64));

-- CreateIndex
CREATE INDEX `User_parentId_idx` ON `User`(`parentId`(64));

-- AddForeignKey
ALTER TABLE `User`
    ADD CONSTRAINT `User_sponsorId_fkey`
    FOREIGN KEY (`sponsorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User`
    ADD CONSTRAINT `User_parentId_fkey`
    FOREIGN KEY (`parentId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
