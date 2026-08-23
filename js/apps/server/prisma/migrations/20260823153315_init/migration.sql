-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `friend_code` VARCHAR(6) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `avatar_url` VARCHAR(191) NULL,
    `access_token` TEXT NULL,
    `refresh_token` TEXT NULL,
    `token_expiry` DATETIME(3) NULL,
    `spotify_access_token` TEXT NULL,
    `spotify_refresh_token` TEXT NULL,
    `spotify_token_expiry` DATETIME(3) NULL,
    `spotify_state` VARCHAR(191) NULL,
    `login_code` VARCHAR(6) NULL,
    `login_code_expiry` DATETIME(3) NULL,
    `last_online` DATETIME(3) NULL,
    `last_song_id` VARCHAR(191) NULL,
    `last_progress` INTEGER NULL,
    `last_is_playing` BOOLEAN NULL,
    `privacy_mode` VARCHAR(191) NOT NULL DEFAULT 'friends',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_friend_code_key`(`friend_code`),
    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `friends` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `friend_id` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `friends_user_id_friend_id_key`(`user_id`, `friend_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `listen_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `listener_id` VARCHAR(191) NOT NULL,
    `target_id` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `state` TEXT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `listen_sessions_listener_id_target_id_key`(`listener_id`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cache_entries` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `cache_entries_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `friends` ADD CONSTRAINT `friends_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `friends` ADD CONSTRAINT `friends_friend_id_fkey` FOREIGN KEY (`friend_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
