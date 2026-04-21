# VODs Backend API

This is the Express.js backend API for Tsunami's Twitch VODs project.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up PostgreSQL database and create a `.env` file in the project root with the required environment variables:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vods
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# YouTube API
YOUTUBE_API_KEY=your_youtube_api_key
YOUTUBE_CHANNEL_ID=your_channel_id

# Optional
PORT=3001
NODE_ENV=development
```

3. Run database migrations:
```bash
# Run all pending migrations
npm run migrate

# Check migration status
npm run migrate:status
```

4. Import existing data (optional):
```bash
# Import data from JSON dump (using npm script)
npm run import-data

# Or with custom file path
npm run import-data /path/to/your/data.json

# Or run directly
node backend/scripts/import_data.js test_data/vods.json
```

5. Start the server:
```bash
# Development mode with auto-reload
npm run backend:dev

# Production mode
npm run backend
```

## API Endpoints

The API automatically loads all endpoints from the `backend/endpoints/` directory (including subdirectories).

**Current Endpoints:**
- **GET /getvods** - Get all VODs from PostgreSQL database
- **GET /ytapi** - Get YouTube playlists 
- **POST /chat** - Chat endpoint with secret key protection (supports both legacy and new formats)
- **GET /health** - Health check endpoint
- **GET /api/v1/test** - Test endpoint (example of nested directory)
- **GET /api-docs** - Swagger API documentation

**Admin Endpoints:**

*Game Management:*
- **GET /admin/game/get** - Get all games with enhanced information (playlist details, videos, etc.)
- **GET /admin/game/get/{id}** - Get a specific game with enhanced information
- **POST /admin/game/create** - Create/upsert a game (new schema; alias of `/admin/playlist/import`)
- **PUT /admin/game/update/{id}** - Update an existing game record
- **DELETE /admin/game/delete/{id}** - Delete a game record

*Playlist Management:*
- **GET /admin/playlist/get** - Get all playlists
- **GET /admin/playlist/get/{id}** - Get a specific playlist
- **POST /admin/playlist/import** - Upsert playlist + videos + stream entry in one call (new schema)
- **POST /admin/playlist/create** - Alias of `/admin/playlist/import`
- **PUT /admin/playlist/update/{id}** - Update an existing playlist
- **DELETE /admin/playlist/delete/{id}** - Delete a playlist

*Chat Management:*
- **POST /admin/chat/upload/{videoId}** - Upload parseChat JSON for a video (body IS the parseChat document)
- **POST /admin/chat/upload-raw** - Upload raw twitch-chat-downloader array (wraps parsing)

*Video Management:*
- **GET /admin/video/get** - Get all videos
- **GET /admin/video/get/{id}** - Get a specific video
- **POST /admin/video/create** - Create a new video
- **PUT /admin/video/update/{id}** - Update an existing video
- **DELETE /admin/video/delete/{id}** - Delete a video

*System Management:*
- **GET /admin/system/migrations** - Get migration status and history

*Note: Admin endpoints are organized to mirror their URL structure in `backend/endpoints/admin/`. Shared utilities are in `backend/utils/admin_utils.js`.*

### Admin API Usage

Admin endpoints require an API key in the `x-access-key` header. The same endpoint is exposed under three URLs for discoverability — `/admin/playlist/import`, `/admin/playlist/create`, `/admin/game/create` — all accept the same new-schema payload and delegate to the shared `importPlaylist` service.

**Create or update a game (new schema):**
```bash
curl -X POST http://localhost:3001/admin/playlist/import \
  -H "x-access-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "gameName": "Leap Year",
    "gameCover": ["igdb", "co8fkf"],
    "tags": ["Puzzle", "Platformer"],
    "countOverride": 0,
    "dateOverride": "",
    "playlistId": "PL49SnO6hlYwcTVF4aXhLdfFE5PcO4Qeb0",
    "videos": [
      {
        "videoId": "ApIVrGS0OxY",
        "title": "Leap Year",
        "publishedAt": "2026-02-11T01:16:05Z",
        "duration": 24062,
        "description": "Stream Title :: jonesing for a hit of platforming ::"
      }
    ]
  }'
```

Matches an existing game first by YouTube playlist id, then by case-insensitive `gameName`. Returns `201` if a new stream row is created, `200` if an existing one is updated. Pass `"existingStreamId": <id>` to attach to a specific stream row regardless of matching.

The response includes the internal video DB ids needed for chat upload:

```json
{
  "streamId": 667,
  "playlistId": 123,
  "videoIds": [1245],
  "created": false
}
```

**Update a game's metadata only:**
```bash
curl -X PUT http://localhost:3001/admin/game/update/1 \
  -H "x-access-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "gameName": "Super Mario Bros (Updated)",
    "tags": ["Platformer", "Nintendo", "Classic"]
  }'
```

**Get all playlists:**
```bash
curl http://localhost:3001/admin/playlist/get
```

**Get all videos:**
```bash
curl http://localhost:3001/admin/video/get
```

**Create a new video:**
```bash
curl -X POST http://localhost:3001/admin/video/create \
  -H "Content-Type: application/json" \
  -d '{
    "yt_id": "abc123defgh",
    "twitch_id": 12345678,
    "name": "Epic Gaming Session",
    "tags": ["Gaming", "Highlight"]
  }'
```

**Delete a game:**
```bash
curl -X DELETE http://localhost:3001/admin/game/delete/1
```

## Chat Management

### Uploading chat for a video

`POST /admin/chat/upload/<videoId>` takes a parseChat JSON document (the same shape as the files in `parseChat/test_data/*_playlist_chat/*.json`) as the entire request body:

```json
{
  "badgeList": [ ... ],
  "emoteList": [ ... ],
  "userList": [ ... ],
  "chatList": [ { "time": 12, "user": 0, "message": "hello" } ]
}
```

**Upload a local file:**
```bash
curl -X POST http://localhost:3001/admin/chat/upload/<videoId> \
  -H "x-access-key: $API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @0.json
```

`<videoId>` in the path can be either the internal DB id (digits) or a YouTube video id. Alternatively, pass `?youtube_id=...` or `?twitch_id=...` as query params.

The endpoint also accepts, for backward compatibility:
- A `{ "chat_data": <parseChat json>, "video_id"?/"youtube_id"?/"twitch_id"?: ... }` wrapper body
- A raw twitch-chat-downloader array (will be parsed server-side)

### Chat Scripts

**Convert chat data:**
```bash
npm run chat:convert <input-file> <output-file>
```

**Add chat data to database:**
```bash
# Single file (chat ID extracted from filename number)
npm run chat:add ./data/chat123.json

# Entire folder (processes all .json files)
npm run chat:add ./data/chats/
```

**Example usage:**
```bash
# Convert a chat file
npm run chat:convert ./backend/examples/chat-data/chat001.json ./output/converted.json

# Add single chat file to database
npm run chat:add ./backend/examples/chat-data/chat001.json

# Add all chat files from a folder
npm run chat:add ./backend/examples/chat-data/
```

## Adding New Endpoints

To add a new endpoint:

1. Create a `.js` file in the `backend/endpoints/` directory (or any subdirectory)
2. Export a function that accepts the Express `app` parameter
3. Define your routes inside that function

**Example endpoint file:**
```javascript
// backend/endpoints/my-endpoint.js
module.exports = (app) => {
  app.get('/my-endpoint', (req, res) => {
    res.json({ message: 'Hello from my endpoint!' });
  });
  
  app.post('/my-endpoint', (req, res) => {
    res.json({ message: 'POST to my endpoint!' });
  });
};
```

**Nested endpoints are supported:**
```
backend/endpoints/
├── getvods.js          # GET /getvods
├── ytapi.js            # GET /ytapi
├── chat.js             # POST /chat
├── health.js           # GET /health
├── admin/              # Admin endpoints subfolder
│   ├── game/           # Game management endpoints
│   │   ├── get.js      # GET /admin/game/get
│   │   ├── create.js   # POST /admin/game/create
│   │   ├── update.js   # PUT /admin/game/update/:id
│   │   └── delete.js   # DELETE /admin/game/delete/:id
│   ├── playlist/       # Playlist management endpoints
│   │   ├── get.js      # GET /admin/playlist/get
│   │   ├── create.js   # POST /admin/playlist/create
│   │   ├── update.js   # PUT /admin/playlist/update/:id
│   │   └── delete.js   # DELETE /admin/playlist/delete/:id
│   ├── video/          # Video management endpoints
│   │   ├── get.js      # GET /admin/video/get
│   │   ├── create.js   # POST /admin/video/create
│   │   ├── update.js   # PUT /admin/video/update/:id
│   │   └── delete.js   # DELETE /admin/video/delete/:id
│   └── system/         # System management endpoints
│       └── migrations.js # GET /admin/system/migrations
└── api/
    └── v1/
        └── test.js     # GET /api/v1/test
```

## Swagger Documentation

All endpoints with proper JSDoc comments will automatically appear in the Swagger documentation.

Once the server is running, visit http://localhost:3001/api-docs to view the interactive API documentation.

## Database Schema

The PostgreSQL database uses a normalized structure with the following tables:

### Tables

- **`api_secrets`** - API key management
- **`playlists`** - YouTube playlist metadata (id, youtube_id, name, tags)
- **`videos`** - YouTube video metadata (id, yt_id, twitch_id, name, tags)
- **`streams`** - Game completion records (references playlists and videos via foreign keys)
- **`chat_logs`** - Chat messages linked to videos

### Relationships

- `streams.playlist_id` → `playlists.id`
- `streams.first_video_id` → `videos.id`
- `chat_logs.video_id` → `videos.id`

This normalized structure separates YouTube IDs from the main game records and allows for better data management and relationships.

### Schema Organization

The database uses a multi-schema approach for better organization:

- **`vods` schema** - Contains all application data tables (playlists, videos, streams, chat_logs, api_secrets)
- **`system` schema** - Contains infrastructure tables (migration tracking)
- **`public` schema** - Default PostgreSQL schema (kept for compatibility)

The connection pool automatically sets the search path to `vods, system, public`, ensuring that:
- Application queries find tables in the `vods` schema by default
- Migration tracking works transparently in the `system` schema
- Standard PostgreSQL functions remain available from `public`

## Migration System

The backend includes a robust migration tracking system that ensures database changes are applied consistently across environments.

### Key Features

- **📋 Migration Tracking**: Automatically tracks which migrations have been executed
- **🔒 System Schema**: Uses a dedicated `system` schema to store migration metadata
- **🛡️ Integrity Checking**: Uses checksums to detect migration file changes
- **⚡ Performance Monitoring**: Records execution time for each migration
- **🔄 Transaction Safety**: Each migration runs in its own transaction
- **📊 Status Reporting**: View detailed migration status and history

### Migration Commands

```bash
# Run all pending migrations
npm run migrate

# Check status of all migrations
npm run migrate:status
```

### API Key Management

All admin endpoints (`/admin/*`) require authentication via the `x-access-key` header.

```bash
# Create a new API key
npm run manage-keys create "Development Key"

# List all API keys (active and inactive)
npm run manage-keys list

# Invalidate a specific key by ID or name
npm run manage-keys invalidate 1
npm run manage-keys invalidate "Development Key"

# Invalidate all active keys (useful for security incidents)
npm run manage-keys invalidate-all
```

**Example API usage with authentication:**
```bash
# Create a key first
npm run manage-keys create "Test Key"
# Output: 🔑 Key: 4cc5458bdbde1f21e223c8468d203fd42f42c482bda7064aab7122d8121fe1bc

# Use the key in API requests
curl -H "x-access-key: 4cc5458bdbde1f21e223c8468d203fd42f42c482bda7064aab7122d8121fe1bc" \
     http://localhost:3001/admin/game/get
```

### Migration Organization

The migration system follows a clean separation of concerns:

- **`backend/migrations/`** - Contains **only** `.sql` schema files (e.g., `001_init.sql`)
- **`backend/scripts/`** - Contains the migration runner (`migrate.js`) and status checker (`migration_status.js`)

This organization keeps the migrations folder clean and focused solely on database schema definitions, while migration tooling lives with other utility scripts.

### Migration System Details

The migration system creates a `system.migrations` table that tracks:
- **filename**: Name of the migration file
- **checksum**: SHA256 hash to detect file changes
- **executed_at**: When the migration was run
- **execution_time_ms**: How long the migration took
- **success**: Whether the migration completed successfully

### Migration Safety

- **Idempotent**: Safe to run multiple times - only pending migrations execute
- **Change Detection**: Warns if a migration file has been modified after execution
- **Rollback Protection**: Failed migrations are recorded and must be fixed manually
- **Atomic Operations**: Each migration runs in its own transaction

### Example Migration Status Output

```
📊 Migration Status Report
==================================================
📁 Migration files found: 1
✅ Executed migrations: 1

Migration Status:
--------------------------------------------------------------------------------
Status      File                     Executed At              Time(ms)
--------------------------------------------------------------------------------
✅ SUCCESS  001_init.sql             2024-01-15T10:30:45      234ms
--------------------------------------------------------------------------------

📈 Summary:
   🟢 Successful: 1
   🟡 Pending:    0
   🔴 Failed:     0
   📊 Total:      1

🎉 All migrations are up to date!
```

## Data Import

To migrate existing data from a JSON dump:

```bash
# Import from the default test data file
node backend/scripts/import_data.js

# Import from a custom file
node backend/scripts/import_data.js /path/to/your/data.json
```

The import script handles the normalization automatically, creating playlist and video records as needed.

## Architecture

- **Config System**: Centralized configuration with validation (`backend/config/`)
- **Database**: PostgreSQL with connection pooling (`backend/db/`)
- **Services**: Shared business logic for VODs, YouTube API, and chat conversion (`backend/services/`)
- **Endpoints**: Auto-loaded route definitions (`backend/endpoints/`)
- **Migrations**: Database schema files (`backend/migrations/*.sql`) with tracking system managed by scripts
- **Scripts**: CLI tools for migrations, chat conversion, data import, and database management (`backend/scripts/`) - all use snake_case naming
- **Utils**: Helper functions like endpoint loader and admin utilities (`backend/utils/`) - all use snake_case naming

## Cloudflare Workers Integration

The workers in the `/workers` folder have been updated to work with PostgreSQL. They can either:

1. **Proxy mode** (default): Forward requests to your backend API
2. **Direct mode**: Connect directly to a serverless PostgreSQL provider (Neon, Supabase, etc.)

To use direct mode, uncomment the relevant section in the worker and configure the `DATABASE_URL` environment variable. 