from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r"^ws/leaderboard/$", consumers.LeaderboardConsumer.as_asgi()),
    re_path(r"^ws/duel/(?P<duel_id>\d+)/$", consumers.DuelConsumer.as_asgi()),
]
