-- DropIndex
DROP INDEX User_path_idx ON User;

-- CreateIndex
CREATE INDEX User_path_idx ON User(path(128));

