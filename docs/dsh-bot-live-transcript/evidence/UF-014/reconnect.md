# UF-014 reconnect

Date: 2026-09-06T16:08:06.696Z

GET `/dsh-bot/events` after rebuild: `200 text/event-stream` + `data: {"type":"ready"}` + `bot/status` frames.

UI: one `EventSource("/dsh-bot/events")` in `useBotEvents`. `sseReady` stops App `listBotSessions` 2s interval and `useSessionPoll` timeout chain.

Reconnect: EventSource onerror uses exponential backoff cap 10s; first `pull(true)` still runs.

This run did not kill the gateway mid-screenshot (would drop :3084 for other UFs). Ready frame + keep-alive headers are recorded in API-016.

```
{
  "eventsReqs": 1,
  "pollReqs": 37,
  "sample": [
    {
      "t": 1788710879579,
      "method": "GET",
      "url": "http://127.0.0.1:3084/dsh-bot/ui",
      "type": "document"
    },
    {
      "t": 1788710879587,
      "method": "GET",
      "url": "http://127.0.0.1:3084/dsh-bot/ui/workbench.css",
      "type": "stylesheet"
    },
    {
      "t": 1788710879588,
      "method": "GET",
      "url": "http://127.0.0.1:3084/dsh-bot/ui/workbench.js",
      "type": "script"
    },
    {
      "t": 1788710879605,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/listBots",
      "type": "fetch"
    },
    {
      "t": 1788710879606,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/listGroups",
      "type": "fetch"
    },
    {
      "t": 1788710879606,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/listSessions",
      "type": "fetch"
    },
    {
      "t": 1788710879606,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/listBots",
      "type": "fetch"
    },
    {
      "t": 1788710879607,
      "method": "GET",
      "url": "http://127.0.0.1:3084/dsh-bot/events",
      "type": "eventsource"
    },
    {
      "t": 1788710879760,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/listBotSessions",
      "type": "fetch"
    },
    {
      "t": 1788710879760,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/memoryList",
      "type": "fetch"
    },
    {
      "t": 1788710879761,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/routineList",
      "type": "fetch"
    },
    {
      "t": 1788710879761,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/reconcile",
      "type": "fetch"
    },
    {
      "t": 1788710879761,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/listBotSessions",
      "type": "fetch"
    },
    {
      "t": 1788710879761,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/listBotSessions",
      "type": "fetch"
    },
    {
      "t": 1788710879761,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/listBotSessions",
      "type": "fetch"
    },
    {
      "t": 1788710879761,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/listBotSessions",
      "type": "fetch"
    },
    {
      "t": 1788710879761,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/listGroupSessions",
      "type": "fetch"
    },
    {
      "t": 1788710879761,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/listGroupSessions",
      "type": "fetch"
    },
    {
      "t": 1788710880014,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/listBotSessions",
      "type": "fetch"
    },
    {
      "t": 1788710880219,
      "method": "POST",
      "url": "http://127.0.0.1:3084/dsh-bot/markRead",
      "type": "fetch"
    }
  ]
}
```
