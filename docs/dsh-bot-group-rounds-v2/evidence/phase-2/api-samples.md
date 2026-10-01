# Phase 2 API 样本（真实网关 :3084，loopback 免 Cookie）

日期：2026-10-01。房间 `room-ee022847-fb7e-466d-8b19-396b9b1866d1`（小组 `bianji-shi`）。

## prompt 空闲

`POST /dsh-bot/prompt` args=`{"sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1", "text": "@诗人小北 写一句秋天的诗"}`

```json
{
 "ok": true,
 "value": {
  "sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1",
  "messageId": "m-1-6f3fa729",
  "unmatchedMentions": false
 }
}
```

## prompt 忙时入队

`POST /dsh-bot/prompt` args=`{"sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1", "text": "@DSH Bot 一句话评价上面的诗", "requestId": "api-q1"}`

```json
{
 "ok": true,
 "value": {
  "sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1",
  "queued": true,
  "queueId": "q-612c8737-981f-4a41-ae54-d74872261270"
 }
}
```

## prompt 同 requestId 去重

`POST /dsh-bot/prompt` args=`{"sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1", "text": "@DSH Bot 一句话评价上面的诗", "requestId": "api-q1"}`

```json
{
 "ok": true,
 "value": {
  "sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1",
  "queued": true,
  "queueId": "q-612c8737-981f-4a41-ae54-d74872261270"
 }
}
```

## prompt 第二条入队

`POST /dsh-bot/prompt` args=`{"sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1", "text": "再来一句"}`

```json
{
 "ok": true,
 "value": {
  "sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1",
  "queued": true,
  "queueId": "q-c34928cd-58ad-4a58-8b0a-5dd59c5c0c42"
 }
}
```

## history 带 queued

`POST /dsh-bot/history` args=`{"sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1"}`

```json
{
 "ok": true,
 "value": {
  "working": true,
  "queued": [
   {
    "queueId": "q-612c8737-981f-4a41-ae54-d74872261270",
    "text": "@DSH Bot 一句话评价上面的诗",
    "createdAt": 1790826898885
   },
   {
    "queueId": "q-c34928cd-58ad-4a58-8b0a-5dd59c5c0c42",
    "text": "再来一句",
    "createdAt": 1790826898893
   }
  ],
  "items": [
   [
    "message",
    null,
    "@诗人小北 写一句秋天的诗"
   ]
  ]
 }
}
```

## cancelQueued 正常

`POST /dsh-bot/cancelQueued` args=`{"sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1", "queueId": "q-c34928cd-58ad-4a58-8b0a-5dd59c5c0c42"}`

```json
{
 "ok": true,
 "value": {
  "queueId": "q-c34928cd-58ad-4a58-8b0a-5dd59c5c0c42",
  "cancelled": true
 }
}
```

## cancelQueued 已不存在

`POST /dsh-bot/cancelQueued` args=`{"sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1", "queueId": "q-c34928cd-58ad-4a58-8b0a-5dd59c5c0c42"}`

```json
{
 "ok": false,
 "error": {
  "code": "not-found",
  "message": "这条已开始讨论，无法取消"
 }
}
```

## cancelQueued 缺 queueId

`POST /dsh-bot/cancelQueued` args=`{"sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1"}`

```json
{
 "ok": false,
 "error": {
  "code": "invalid-input",
  "message": "sessionId and queueId are required"
 }
}
```

## continueDiscussion 忙

`POST /dsh-bot/continueDiscussion` args=`{"sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1"}`

```json
{
 "ok": false,
 "error": {
  "code": "invalid-input",
  "message": "room is busy"
 }
}
```

## deleteGroupSession 忙

`POST /dsh-bot/deleteGroupSession` args=`{"sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1"}`

```json
{
 "ok": false,
 "error": {
  "code": "invalid-input",
  "message": "room is busy"
 }
}
```

## history 出队后

`POST /dsh-bot/history` args=`{"sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1"}`

```json
{
 "ok": true,
 "value": {
  "working": false,
  "queued": [],
  "items": [
   [
    "message",
    null,
    "@诗人小北 写一句秋天的诗"
   ],
   [
    "message",
    "诗人小北",
    "风把夏天翻过去，\n一页一页，都是黄。"
   ],
   [
    "message",
    null,
    "@DSH Bot 一句话评价上面的诗"
   ],
   [
    "message",
    "DSH Bot",
    "好比喻好在\"翻\"这个动作本身带着季节的单向性——翻过去就翻不回来，\"黄\"既是纸的"
   ]
  ]
 }
}
```

## continueDiscussion 空闲

`POST /dsh-bot/continueDiscussion` args=`{"sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1"}`

```json
{
 "ok": true,
 "value": {
  "sessionId": "room-ee022847-fb7e-466d-8b19-396b9b1866d1",
  "messageId": "m-5-0493141c"
 }
}
```

## continueDiscussion 缺 sessionId

`POST /dsh-bot/continueDiscussion` args=`{}`

```json
{
 "ok": false,
 "error": {
  "code": "invalid-input",
  "message": "sessionId is required"
 }
}
```

## continueDiscussion 1:1 拒绝

`POST /dsh-bot/continueDiscussion` args=`{"sessionId": "session-891c5fa4-3098-4505-91fd-945001b4ede9"}`

```json
{
 "ok": false,
 "error": {
  "code": "not-found",
  "message": "房间不存在"
 }
}
```

## deleteGroupSession 正常

`POST /dsh-bot/deleteGroupSession` args=`{"sessionId": "room-8d0d77bc-48ad-49ce-8f2c-ea2932fcb3dc"}`

```json
{
 "ok": true,
 "value": {
  "roomId": "room-8d0d77bc-48ad-49ce-8f2c-ea2932fcb3dc",
  "deleted": true
 }
}
```

## deleteGroupSession 不存在

`POST /dsh-bot/deleteGroupSession` args=`{"sessionId": "room-8d0d77bc-48ad-49ce-8f2c-ea2932fcb3dc"}`

```json
{
 "ok": false,
 "error": {
  "code": "group-not-found",
  "message": "房间不存在"
 }
}
```

## deleteGroupSession 缺 sessionId

`POST /dsh-bot/deleteGroupSession` args=`{"sessionId": " "}`

```json
{
 "ok": false,
 "error": {
  "code": "invalid-input",
  "message": "sessionId is required"
 }
}
```

## deleteGroupSession 路径穿越

`POST /dsh-bot/deleteGroupSession` args=`{"sessionId": "../bots"}`

```json
{
 "ok": false,
 "error": {
  "code": "group-not-found",
  "message": "房间不存在"
 }
}
```

## 继续讨论后的房间投影

```json
[
 [
  "message",
  null,
  "@诗人小北 写一句秋天的诗"
 ],
 [
  "message",
  "诗人小北",
  "风把夏天翻过去，\n一页一页，都是黄。"
 ],
 [
  "message",
  null,
  "@DSH Bot 一句话评价上面的诗"
 ],
 [
  "message",
  "DSH Bot",
  "好比喻好在\"翻\"这个动作本身带着季节的单向性——翻过去就翻不回来，\"黄\"既是纸的"
 ],
 [
  "system",
  null,
  "继续讨论"
 ],
 [
  "message",
  "诗人小北",
  "「一页一页」不是铺——是翻的声音，删了就只剩结论。"
 ],
 [
  "message",
  "DSH Bot",
  "声音是你读进去的——纸上只有\"一页一页\"四个字，翻页的响动得靠读的人自己放慢才听"
 ],
 [
  "message",
  "诗人小北",
  "诗本来就在两者之间：写的时候留白，读的时候才填满——\"一页一页\"是留给嘴的空当。"
 ],
 [
  "message",
  "DSH Bot",
  "这话我同意，但它宽到能套在任意一行诗上——只要留白都能说是给读者的空当，于是它解"
 ]
]
```
