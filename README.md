# Apollo Link

An Express.js backend service for handling Apollo assistant's social integrations and device authentication. This service provides secure OAuth flows for Google and Spotify, device management with cryptographic authentication, and real-time WebSocket communication.

## Features

### 🔐 Device Authentication
- Cryptographic device registration and authentication
- Challenge-response authentication using RSA signatures
- Public key rotation support
- Redis-based challenge storage with TTL

### 🌐 OAuth Integrations
- **Google OAuth**: Calendar access with offline tokens
- **Spotify OAuth**: Playback control and state management
- Server-Sent Events (SSE) for real-time auth status updates
- QR code compatible authentication flows

### 👤 User Management
- Email/password registration and login
- Google Sign-In integration
- JWT-based session management
- Device-user association tracking

### 🔄 Real-time Communication
- WebSocket server with device authentication
- Redis pub/sub for device notifications
- Secure connection validation using cryptographic signatures

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js 5.x
- **Database**: PostgreSQL with connection pooling
- **Cache/Messaging**: Redis with ioredis
- **Authentication**: JWT, bcrypt, Google Auth Library
- **WebSockets**: ws library
- **Build**: TypeScript compiler with tsc-watch

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Redis server
- Google Cloud Console project (for Google OAuth)
- Spotify Developer account (for Spotify OAuth)

### Installation

```bash
# Clone the repository
git clone https://github.com/MaciejkaG/apollo-spotify-auth.git
cd apollo-link

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Environment Variables

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
JWT_SECRET=your-jwt-secret-key

# Database
POSTGRES_URL=postgresql://username:password@localhost:5432/apollo_link
REDIS_URL=redis://localhost:6379

# Google OAuth
GOOGLE_REDIRECT_URI=http://localhost:3000/google/callback

# Spotify OAuth
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/spotify/callback
```

### Database Setup

```bash
# Create the database schema
psql -d your_database -f schema.sql
```

### Google Cloud Setup

1. Create a project in Google Cloud Console
2. Enable the Google Calendar API
3. Create OAuth 2.0 credentials
4. Download the credentials JSON file as `google-cloud-credentials.json`

### Running the Application

```bash
# Development mode with auto-reload
npm run dev

# Production build and start
npm run build
npm start
```

## API Documentation

### Device Management

#### Register Device
```http
POST /device/register
Content-Type: application/json

{
  "device_id": "unique-device-identifier",
  "public_key": "-----BEGIN PUBLIC KEY-----\n..."
}
```

#### Request Authentication Challenge
```http
POST /device/auth/request
Content-Type: application/json

{
  "device_id": "unique-device-identifier"
}
```

#### Verify Challenge Response
```http
POST /device/auth/verify
Content-Type: application/json

{
  "device_id": "unique-device-identifier",
  "signature": "base64-encoded-signature"
}
```

### OAuth Flows

#### Google Authentication
```http
# Start authentication
GET /google/start-auth

# Monitor auth status (SSE)
GET /google/sse/{state}

# Direct auth URL (for QR codes)
GET /google/auth/{state}
```

#### Spotify Authentication
```http
# Start authentication
GET /spotify/start-auth

# Monitor auth status (SSE)
GET /spotify/sse/{state}

# Direct auth URL (for QR codes)
GET /spotify/auth/{state}
```

### User Management

#### Register User
```http
POST /mobile/register
Content-Type: application/json

{
  "full_name": "John Doe",
  "email": "john@example.com",
  "password": "secure-password"
}
```

#### Login
```http
POST /mobile/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "secure-password"
}
```

#### Google Sign-In
```http
POST /mobile/google-signin
Content-Type: application/json

{
  "google_id": "google-user-id",
  "full_name": "John Doe",
  "email": "john@example.com"
}
```

## WebSocket Connection

Connect to the WebSocket server for real-time notifications:

```javascript
const ws = new WebSocket('ws://localhost:3000?deviceId=your-device-id&signature=signature&challenge=challenge');

ws.on('message', (data) => {
  const notification = JSON.parse(data);
  console.log('Received notification:', notification);
});
```

## Database Schema

The application uses three main tables:

- **devices**: Store device information and public keys
- **users**: User accounts with email/password and Google OAuth
- **user_devices**: Many-to-many relationship between users and devices

See `schema.sql` for the complete database structure.

## Security Features

- RSA signature-based device authentication
- Time-limited authentication challenges (60 seconds)
- JWT tokens for user sessions
- Bcrypt password hashing
- Environment-based configuration
- HTTPS-ready with trust proxy support

## Development

### Project Structure

```
apollo-link/
├── routers/           # API route handlers
│   ├── device.ts      # Device management
│   ├── google.ts      # Google OAuth
│   ├── spotify.ts     # Spotify OAuth
│   └── mobile.ts      # User management
├── services/          # Business logic
│   └── websocket.ts   # WebSocket server
├── utils/             # Utilities
│   ├── db.ts          # Database connections
│   └── helpers.ts     # Helper functions
├── html/              # Success pages
├── public/            # Static assets
└── dist/              # Compiled JavaScript
```

### Building

```bash
# Compile TypeScript
npm run build

# Watch mode for development
npm run dev
```

## License

This project is licensed under the GPL-3.0 License. See the [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions, please use the [GitHub Issues](https://github.com/MaciejkaG/apollo-spotify-auth/issues) page.