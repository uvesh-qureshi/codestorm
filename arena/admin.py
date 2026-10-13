from django.contrib import admin

from .models import Duel, Event, Participant, Problem, Session, Submission, Team

for m in (Event, Session, Team, Participant, Problem, Submission, Duel):
    admin.site.register(m)
