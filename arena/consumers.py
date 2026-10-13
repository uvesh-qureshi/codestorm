"""WebSocket consumers - server khud browser ko data push karta hai (refresh ki zarurat nahi)."""
import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .services import build_snapshot, presence


class PushMixin:
    async def push(self, event):
        await self.send(text_data=json.dumps(event["payload"]))


class LeaderboardConsumer(PushMixin, AsyncWebsocketConsumer):
    """Ek hi socket: leaderboard, ticker, check-in events aur 'coders online' count."""

    group = "leaderboard"
    counted = False

    async def connect(self):
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        presence["n"] += 1
        self.counted = True
        snap = await database_sync_to_async(build_snapshot)()
        await self.send(text_data=json.dumps({"kind": "snapshot", **snap}))
        await self._announce_presence()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group, self.channel_name)
        if self.counted:
            presence["n"] = max(0, presence["n"] - 1)
            self.counted = False
            await self._announce_presence()

    async def _announce_presence(self):
        await self.channel_layer.group_send(
            self.group, {"type": "push", "payload": {"kind": "presence", "online": presence["n"]}}
        )


class DuelConsumer(PushMixin, AsyncWebsocketConsumer):
    async def connect(self):
        self.group = f"duel_{self.scope['url_route']['kwargs']['duel_id']}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group, self.channel_name)
