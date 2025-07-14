CREATE TABLE devices (
    device_id VARCHAR(255) PRIMARY KEY,
    public_key TEXT NOT NULL,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    key_version INTEGER DEFAULT 1 NOT NULL
);

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_devices (
    user_id INTEGER REFERENCES users(user_id),
    device_id VARCHAR(255) REFERENCES devices(device_id),
    PRIMARY KEY (user_id, device_id)
);