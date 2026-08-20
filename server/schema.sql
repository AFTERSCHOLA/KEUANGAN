CREATE TABLE absensi (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NULL,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_absensi_cabang_created (cabang_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE spp_payments (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NULL,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_spp_cabang_created (cabang_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE honor_payments (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NULL,
    correction_of VARCHAR(191) NULL,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_honor_cabang_created (cabang_id, created_at),
    INDEX idx_honor_correction (correction_of)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sync_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entity VARCHAR(64) NOT NULL,
    record_id VARCHAR(191) NOT NULL,
    operation VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sync_entry (entity, record_id, operation)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
