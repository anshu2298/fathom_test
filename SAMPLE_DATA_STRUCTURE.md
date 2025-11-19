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
