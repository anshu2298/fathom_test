# Sample Data Structure for Meeting Transcripts

This document shows how meeting data is structured when inserted into the `meeting_transcripts` table.

## 1. Data from Webhook (Real-time from Fathom)

When a meeting is completed, Fathom sends a webhook to `/api/fathom/webhook/:userId`. Here's the sample data structure:

```json
{
  "user_id": "user_1234567890_abc123",
  "title": "Weekly Team Sync - Product Discussion",
  "transcript": [
    {
      "text": "Good evening, Ashwak.",
      "speaker": {
        "display_name": "Anshu Singh",
        "matched_calendar_invitee_email": "anshusingh2298@gmail.com"
      },
      "timestamp": "00:00:07"
    },
    {
      "text": "Hi, Anshu.",
      "speaker": {
        "display_name": "Ashwak",
        "matched_calendar_invitee_email": "ashwakshaik15@gmail.com"
      },
      "timestamp": "00:00:13"
    },
    {
      "text": "This meeting is being recorded.",
      "speaker": {
        "display_name": "Shalika Agarwal",
        "matched_calendar_invitee_email": "shalika@mybizsherpa.com"
      },
      "timestamp": "00:00:15"
    }
  ],
  "created_at": "2024-01-10T15:30:00.000Z"
}
```

**Note:** The webhook route only stores these fields:

- `user_id`
- `title`
- `transcript` (normalized to always be an array)
- `created_at`

---

## 2. Data from Import Route (Historical Meetings)

When importing historical meetings via `/api/fathom/import`, more complete data is stored:

```json
{
  "user_id": "user_1234567890_abc123",
  "recording_id": "rec_abc123xyz789",
  "title": "Weekly Team Sync - Product Discussion",
  "meeting_title": "Weekly Team Sync - Product Discussion",
  "url": "https://fathom.video/recording/rec_abc123xyz789",
  "transcript": [
    {
      "text": "Good evening, Ashwak.",
      "speaker": {
        "display_name": "Anshu Singh",
        "matched_calendar_invitee_email": "anshusingh2298@gmail.com"
      },
      "timestamp": "00:00:07"
    },
    {
      "text": "Hi, Anshu.",
      "speaker": {
        "display_name": "Ashwak",
        "matched_calendar_invitee_email": "ashwakshaik15@gmail.com"
      },
      "timestamp": "00:00:13"
    }
  ],
  "raw_payload": {
    "meeting": {
      "recordingId": "rec_abc123xyz789",
      "title": "Weekly Team Sync - Product Discussion",
      "meetingTitle": "Weekly Team Sync - Product Discussion",
      "url": "https://fathom.video/recording/rec_abc123xyz789",
      "createdAt": "2024-01-10T15:30:00.000Z"
    },
    "transcript": [
      {
        "text": "Good evening, Ashwak.",
        "speaker": {
          "display_name": "Anshu Singh",
          "matched_calendar_invitee_email": "anshusingh2298@gmail.com"
        },
        "timestamp": "00:00:07"
      }
    ]
  },
  "created_at": "2024-01-10T15:30:00.000Z"
}
```

**Note:** The import route stores additional fields:

- `recording_id` - Unique Fathom recording ID
- `meeting_title` - Alternative title field
- `url` - Direct link to the Fathom recording
- `raw_payload` - Complete original data from Fathom API (for reference)

---

## 3. Complete Database Record Example

Here's what a complete record looks like in the database:

```json
{
  "id": 1,
  "user_id": "user_1234567890_abc123",
  "recording_id": "rec_abc123xyz789",
  "title": "Weekly Team Sync - Product Discussion",
  "meeting_title": "Weekly Team Sync - Product Discussion",
  "url": "https://fathom.video/recording/rec_abc123xyz789",
  "transcript": [
    {
      "text": "Good evening, Ashwak.",
      "speaker": {
        "display_name": "Anshu Singh",
        "matched_calendar_invitee_email": "anshusingh2298@gmail.com"
      },
      "timestamp": "00:00:07"
    },
    {
      "text": "Hi, Anshu.",
      "speaker": {
        "display_name": "Ashwak",
        "matched_calendar_invitee_email": "ashwakshaik15@gmail.com"
      },
      "timestamp": "00:00:13"
    },
    {
      "text": "This meeting is being recorded.",
      "speaker": {
        "display_name": "Shalika Agarwal",
        "matched_calendar_invitee_email": "shalika@mybizsherpa.com"
      },
      "timestamp": "00:00:15"
    }
  ],
  "raw_payload": {
    "meeting": {
      "recordingId": "rec_abc123xyz789",
      "title": "Weekly Team Sync - Product Discussion",
      "meetingTitle": "Weekly Team Sync - Product Discussion",
      "url": "https://fathom.video/recording/rec_abc123xyz789",
      "createdAt": "2024-01-10T15:30:00.000Z"
    },
    "transcript": [
      {
        "text": "Good evening, Ashwak.",
        "speaker": {
          "display_name": "Anshu Singh",
          "matched_calendar_invitee_email": "anshusingh2298@gmail.com"
        },
        "timestamp": "00:00:07"
      }
    ]
  },
  "created_at": "2024-01-10T15:30:00.000Z",
  "updated_at": "2024-01-10T15:30:00.000Z"
}
```

---

## Field Descriptions

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `id` | integer | Auto-generated primary key | Database |
| `user_id` | string | Unique user identifier | Both |
| `recording_id` | string | Fathom recording ID | Import only |
| `title` | string | Meeting title | Both |
| `meeting_title` | string | Alternative meeting title | Import only |
| `url` | string | Fathom recording URL | Import only |
| `transcript` | array | Array of transcript items | Both |
| `raw_payload` | object | Complete original data | Import only |
| `created_at` | timestamp | When meeting was created | Both |
| `updated_at` | timestamp | Auto-updated timestamp | Database |

---

## Transcript Item Structure

Each item in the `transcript` array follows this structure:

```json
{
  "text": "The actual spoken text",
  "speaker": {
    "display_name": "Speaker Name",
    "matched_calendar_invitee_email": "speaker@example.com"
  },
  "timestamp": "00:05:23"
}
```

---

## Notes

1. **Transcript Format**: The transcript is always normalized to be an array, even if Fathom sends it in a nested format like `{"transcript": [...]}`.

2. **Webhook vs Import**:
   - Webhook data is simpler (fewer fields) but arrives in real-time
   - Import data is more complete (includes `recording_id`, `url`, `raw_payload`) but requires manual import

3. **Data Isolation**: All records are scoped by `user_id` to ensure data isolation between users.

4. **Duplicate Prevention**: The import route checks for existing meetings using `recording_id` + `user_id` to prevent duplicates.

Creating a flow diagram of the authentication endpoints and functions:

[1 tool called]

Flow diagram of the authentication system:

## Fathom Authentication Flow Diagram

### Complete OAuth connection flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    INITIAL CONNECTION FLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. USER INITIATES CONNECTION
   └─> GET /api/fathom/connect?user_id=xxx
       │
       ├─> getUserId(req)
       │   └─> Checks: query → header → body
       │
       ├─> validateUserId(userId)
       │   └─> Validates format & trims
       │
       └─> Fathom.getAuthorizationUrl()
           └─> Creates OAuth URL with state (base64 encoded userId)
           │
           └─> res.redirect(authUrl)
               └─> User redirected to Fathom authorization page

2. USER AUTHORIZES ON FATHOM
   └─> Fathom OAuth Server
       └─> User clicks "Authorize"
       └─> Fathom redirects back with code & state

3. OAUTH CALLBACK
   └─> GET /api/fathom/callback?code=xxx&state=xxx
       │
       ├─> Extract userId from state (base64 decode)
       │
       ├─> validateUserId(userId)
       │
       ├─> ensureFathomEnv()
       │   └─> Validates FATHOM_CLIENT_ID & FATHOM_CLIENT_SECRET
       │
       └─> EXTERNAL API CALL
           └─> POST https://fathom.video/external/v1/oauth2/token
               │
               ├─> Body: {
               │     client_id,
               │     client_secret,
               │     code,
               │     redirect_uri,
               │     grant_type: "authorization_code"
               │   }
               │
               └─> Response: {
                     access_token,
                     refresh_token,
                     expires_in
                   }

4. STORE TOKENS
   └─> persistConnectionTokens(userId, access_token, refresh_token, expiresAt)
       │
       └─> DATABASE OPERATION
           └─> Supabase: fathom_connections.upsert({
                 user_id,
                 access_token,
                 refresh_token,
                 token_expires_at
               })

5. SUCCESS
   └─> res.redirect(/?user_id=xxx&connected=true)
```

---

### Token usage flow (when making API calls)

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOKEN USAGE FLOW                             │
│              (When other parts of app need tokens)               │
└─────────────────────────────────────────────────────────────────┘

EXTERNAL CODE CALLS:
  └─> getValidAccessToken(userId)
      │
      ├─> ensureFathomEnv()
      │   └─> Validates environment variables
      │
      ├─> fetchConnectionRow(userId)
      │   └─> DATABASE QUERY
      │       └─> Supabase: fathom_connections
      │           └─> SELECT * WHERE user_id = userId
      │
      ├─> Check if connection exists
      │   └─> If NO: Throw error "User not connected"
      │
      └─> CHECK TOKEN EXPIRATION
          │
          ├─> Calculate: expiresAt > (now + 60 seconds buffer)
          │
          ├─> IF TOKEN VALID:
          │   └─> Return existing access_token ✅
          │
          └─> IF TOKEN EXPIRED/EXPIRING:
              └─> refreshStoredAccessToken(userId, connection)
                  │
                  ├─> ensureFathomEnv()
                  │
                  ├─> Check refresh_token exists
                  │
                  └─> EXTERNAL API CALL
                      └─> POST https://fathom.video/external/v1/oauth2/token
                          │
                          ├─> Body: {
                          │     client_id,
                          │     client_secret,
                          │     refresh_token,
                          │     grant_type: "refresh_token"
                          │   }
                          │
                          └─> Response: {
                                access_token (new),
                                refresh_token (new or same),
                                expires_in
                              }
                          │
                          └─> persistConnectionTokens(...)
                              └─> Update database with new tokens
                          │
                          └─> Return new access_token ✅
```

---

### Function dependency tree

```
┌─────────────────────────────────────────────────────────────────┐
│                    FUNCTION DEPENDENCIES                         │
└─────────────────────────────────────────────────────────────────┘

ENDPOINT: /api/fathom/connect
├─> getUserId(req)
└─> validateUserId(userId)

ENDPOINT: /api/fathom/callback
├─> validateUserId(userId)
├─> ensureFathomEnv()
├─> persistConnectionTokens()
│   └─> Uses: supabase client
│
EXPORTED: getValidAccessToken(userId)
├─> ensureFathomEnv()
├─> fetchConnectionRow(userId)
│   └─> Uses: supabase client
└─> refreshStoredAccessToken(userId, connection)
    ├─> ensureFathomEnv()
    └─> persistConnectionTokens()
        └─> Uses: supabase client

EXPORTED: getUserId(req)
└─> (standalone - no dependencies)

EXPORTED: validateUserId(userId)
└─> (standalone - no dependencies)
```

---

### External interactions

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL INTERACTIONS                        │
└─────────────────────────────────────────────────────────────────┘

1. FATHOM OAUTH SERVER
   ├─> Authorization URL (user redirect)
   │   └─> https://fathom.video/oauth/authorize?...
   │
   └─> Token Endpoint (API call)
       └─> POST https://fathom.video/external/v1/oauth2/token
           ├─> For initial token exchange (authorization_code)
           └─> For token refresh (refresh_token)

2. SUPABASE DATABASE
   └─> Table: fathom_connections
       ├─> Operations: SELECT, UPSERT
       └─> Fields:
           ├─> user_id (primary identifier)
           ├─> access_token
           ├─> refresh_token
           └─> token_expires_at (Unix timestamp)
```

---

### Sequence diagram (step-by-step)

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Client  │    │  Server  │    │  Fathom  │    │ Database │    │  Helper  │
│          │    │          │    │   OAuth  │    │          │    │ Functions│
└────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │               │               │
     │ 1. GET /connect│               │               │               │
     │──────────────>│               │               │               │
     │               │ getUserId()   │               │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │               │ validateUserId│               │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │ 2. Redirect   │               │               │               │
     │<──────────────│               │               │               │
     │               │               │               │               │
     │ 3. GET Fathom │               │               │               │
     │───────────────┼──────────────>│               │               │
     │               │               │               │               │
     │ 4. Authorize  │               │               │               │
     │───────────────┼──────────────>│               │               │
     │               │               │               │               │
     │ 5. Callback  │               │               │               │
     │<──────────────┼───────────────│               │               │
     │               │               │               │               │
     │ 6. GET /callback│             │               │               │
     │──────────────>│               │               │               │
     │               │ validateUserId│               │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │               │ ensureFathomEnv│               │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │               │ 7. POST /token│               │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │               │ 8. Tokens     │               │               │
     │               │<──────────────│               │               │
     │               │               │               │               │
     │               │ persistTokens │               │               │
     │               │──────────────>│               │               │
     │               │               │               │
     │               │               │ 9. UPSERT    │               │
     │               │               │──────────────>│               │
     │               │               │               │               │
     │               │               │ 10. Success  │               │
     │               │               │<──────────────│               │
     │               │               │               │               │
     │ 11. Redirect  │               │               │               │
     │<──────────────│               │               │               │
     │               │               │               │               │
```

---

### Summary table

| Component | Type | Purpose | Used By |
|-----------|------|---------|---------|
| `/api/fathom/connect` | Endpoint | Start OAuth flow | Client |
| `/api/fathom/callback` | Endpoint | Handle OAuth callback | Fathom OAuth |
| `getUserId()` | Helper | Extract user ID from request | Routes |
| `validateUserId()` | Helper | Validate user ID format | Routes |
| `ensureFathomEnv()` | Helper | Check env variables | Token operations |
| `persistConnectionTokens()` | Helper | Save tokens to DB | Callback, Refresh |
| `fetchConnectionRow()` | Helper | Get user's connection data | Token validation |
| `refreshStoredAccessToken()` | Helper | Refresh expired tokens | getValidAccessToken |
| `getValidAccessToken()` | Helper | Get valid token (auto-refresh) | External code |
| `FATHOM_TOKEN_URL` | Constant | Fathom token endpoint URL | Token operations |
| `TOKEN_REFRESH_BUFFER_SECONDS` | Constant | 60s buffer before expiry | Token validation |

This diagram shows how the authentication system works from initial connection through token management.

The exact flow:
Step 1: Fetch all meetings (NO transcripts)
Line 89: await fathom.listMeetings({})
Returns meeting metadata (title, recordingId, url, createdAt, etc.)
Does not include transcripts
Step 2: Check database for duplicates
Lines 113-118: Checks if recording_id already exists in the database for this user
Step 3: Skip transcript fetch if duplicate exists
Lines 120-132: If the meeting already exists:
Logs it as skipped
Adds to skipped array with reason "already_exists"
Continues to the next meeting (skips transcript fetching)
Step 4: Fetch transcript ONLY if meeting doesn't exist
Lines 134-167: Only executes if the meeting is NOT a duplicate:
Makes API call: GET /recordings/{recordingId}/transcript
Fetches the full transcript data
Step 5: Save to database
Lines 170-184: Saves the meeting with transcript to the database
Why this optimization matters:
Avoids unnecessary API calls: doesn't fetch transcripts for meetings already in the database
Faster execution: checking the database is much faster than fetching transcripts
Lower API usage: reduces Fathom API calls
Cost savings: transcript fetching can be expensive/heavy operations
