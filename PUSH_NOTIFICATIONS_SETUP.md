# Push Notifications Setup (Firebase + iOS Home Screen)

This project now includes client-side support for:
- Notification toggle in Home settings (`Notifications: Off/On`)
- Firebase Messaging token registration per user/device in Firestore
- PWA badge updates via Badging API (`setAppBadge` / `clearAppBadge`)
- Service worker handling for background push messages

To finish end-to-end push delivery, complete these steps.

## 0. Upgrade to Blaze (required for Functions deploy)

Cloud Functions deployment requires Blaze for this project. From this workspace, deployment failed with:

- `Your project bunk-buddies-dev must be on the Blaze (pay-as-you-go) plan...`

Upgrade here:

- `https://console.firebase.google.com/project/bunk-buddies-dev/usage/details`

Recommended safety setup right after upgrade:

- Add a Google Cloud Billing budget alert (for example: $5 and $10 thresholds).

## 1. Add your Firebase Web Push VAPID key (one-time developer setup)

Set your key once in code so users never need manual setup:

- File: `js/push_notifications.js`
- Constant: `DEFAULT_VAPID_KEY`

Example:

```javascript
const DEFAULT_VAPID_KEY = 'YOUR_PUBLIC_VAPID_KEY';
```

Notes:

- This is the **public** VAPID key (safe for client-side use).
- Keep private/service credentials only in backend.

## 2. Deploy Firestore rules

This change added:
- `/apartments/{apartmentCode}/pushTokens/{tokenId}`

Deploy rules:

```powershell
firebase deploy --only firestore:rules
```

## 3. Deploy the push backend function

Install dependencies:

```powershell
cd functions
npm install
```

Deploy function:

```powershell
firebase deploy --only "functions"
```

## 4. Send pushes from trusted backend (already implemented)

This repository already includes a Cloud Function trigger in `functions/index.js`:

- `sendPushOnNotificationCreated`
- Trigger: `/apartments/{apartmentCode}/notifications/{notificationId}`
- Sends web push to matching `/pushTokens`
- Includes `badgeCount` in payload
- Cleans up invalid/unregistered tokens automatically

Recommended trigger:
- On create of `/apartments/{apartmentCode}/notifications/{notificationId}`
- Read all docs in `/apartments/{apartmentCode}/pushTokens`
- Filter tokens where `userName` matches notification `userName`
- Count unread notifications for that user
- Send FCM message with:
  - `notification.title`
  - `notification.body`
  - `data.link` (for deep link)
  - `data.badgeCount` (string)

Example payload shape:

```json
{
  "notification": {
    "title": "Bunk Buddies",
    "body": "Alex assigned you a task: Dishes"
  },
  "data": {
    "link": "tasks.html?taskId=abc123",
    "badgeCount": "3"
  },
  "token": "<recipient-fcm-token>"
}
```

## 5. iOS behavior notes

- Push notifications in iOS web apps require users to add the app to Home Screen.
- Permission request must come from a user gesture (the new settings toggle does this).
- Badge updates rely on iOS support for Web Push + Badging APIs.

## 6. Verify flow

1. Install app to iOS Home Screen.
2. Open app and toggle `Notifications: On`.
3. Confirm token doc appears in Firestore under `pushTokens`.
4. Trigger a task/event notification for this user.
5. Backend sends FCM push with `badgeCount`.
6. App icon badge updates.
7. Opening app clears external badge.
