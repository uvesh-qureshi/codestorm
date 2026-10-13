from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

urlpatterns = [
    # auth
    path("register/", views.register),
    path("login/", TokenObtainPairView.as_view()),
    path("login/refresh/", TokenRefreshView.as_view()),
    path("me/", views.me),
    # home: stats, featured match, ticker, leaderboard
    path("stats/", views.stats),
    path("featured/", views.featured),
    path("activity/", views.activity),
    path("leaderboard/", views.leaderboard),
    # problems
    path("problems/", views.problems),
    path("problems/<int:problem_id>/run/", views.run_sample),
    path("problems/<int:problem_id>/submit/", views.submit),
    # 1v1 duel
    path("duels/quick/", views.duel_quick),
    path("duels/<int:duel_id>/", views.duel_detail),
    path("duels/<int:duel_id>/submit/", views.duel_submit),
    # schedule + QR check-in
    path("schedule/", views.schedule),
    path("checkin/", views.checkin),
    path("checkins/", views.checkins),
    path("participants/lookup/", views.lookup),
    # teams + matchmaker + invites
    path("teams/", views.teams),
    path("teams/<int:team_id>/join/", views.team_join),
    path("teams/leave/", views.team_leave),
    path("matchmaker/", views.matchmaker),
    path("connect/<int:participant_id>/", views.connect),
    path("invites/", views.invites),
    path("invites/<int:invite_id>/respond/", views.invite_respond),
]
