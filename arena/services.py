"""Helper functions: scores/leaderboard, live broadcast, activity feed, QR image."""
import base64
import io

import qrcode
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models import Count, Q
from django.utils import timezone

from .models import Activity, Duel, Participant, Problem, Submission

DUEL_WIN_POINTS = 50
FIRST_SOLVE_BONUS = 25

# Kitne log abhi live socket se jude hain ("Coders online")
presence = {"n": 0}


def get_participant(user):
    """Har user ka Participant hota hai (admin ke liye auto-create)."""
    p, _ = Participant.objects.get_or_create(user=user, defaults={"display_name": user.username})
    return p


def qr_data_uri(text):
    img = qrcode.make(text, box_size=8, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def participant_dict(p, with_qr=False):
    data = {
        "id": p.id,
        "code": p.code,
        "display_name": p.display_name,
        "initials": p.initials,
        "skills": p.skill_list(),
        "experience": p.experience,
        "project_idea": p.project_idea,
        "looking_for_team": p.looking_for_team,
        "team": p.team.name if p.team else None,
        "team_id": p.team_id,
        "checked_in": p.checked_in,
    }
    if with_qr:
        data["qr"] = qr_data_uri(str(p.qr_token))
        data["is_staff"] = p.user.is_staff
        data["username"] = p.user.username
        # {session_id: scan time}
        data["checkins"] = {str(c.session_id): c.scanned_at.isoformat() for c in p.checkins.all()}
    return data


# ───────────────────────── scores ─────────────────────────
def compute_rows(period="all"):
    """Leaderboard rows. period = 'all' ya 'today'.

    Score = har problem ke points (ek baar) + 25 first-solve bonus + 50 per duel win.
    """
    today = timezone.localdate()

    def in_period(dt):
        return period == "all" or timezone.localtime(dt).date() == today

    first_by_pair = {}  # (participant, problem) -> pehli passed submission
    first_by_problem = {}  # problem -> sabse pehli passed submission (first solve bonus)
    subs = Submission.objects.filter(passed=True).select_related("problem").order_by("created_at", "id")
    for s in subs:
        first_by_pair.setdefault((s.participant_id, s.problem_id), s)
        first_by_problem.setdefault(s.problem_id, s)

    score, solved, bonus = {}, {}, {}
    for (pid, prob_id), s in first_by_pair.items():
        if not in_period(s.created_at):
            continue
        score[pid] = score.get(pid, 0) + s.problem.points
        solved[pid] = solved.get(pid, 0) + 1
        if first_by_problem[prob_id].id == s.id:
            score[pid] += FIRST_SOLVE_BONUS
            bonus[pid] = bonus.get(pid, 0) + 1

    wins = {}
    for d in Duel.objects.filter(winner__isnull=False):
        if in_period(d.created_at):
            wins[d.winner_id] = wins.get(d.winner_id, 0) + 1

    rows = []
    for p in Participant.objects.select_related("team", "user").filter(user__is_staff=False):
        rows.append(
            {
                "id": p.id,
                "name": p.display_name,
                "initials": p.initials,
                "team": p.team.name if p.team else None,
                "solved": solved.get(p.id, 0),
                "duel_wins": wins.get(p.id, 0),
                "first_solves": bonus.get(p.id, 0),
                "score": score.get(p.id, 0) + DUEL_WIN_POINTS * wins.get(p.id, 0),
            }
        )
    rows.sort(key=lambda r: (-r["score"], -r["solved"], r["name"]))
    for i, r in enumerate(rows, start=1):
        r["rank"] = i
    return rows


def compute_trends():
    return [
        {"problem": pr.title, "attempts": pr.attempts, "solves": pr.solves}
        for pr in Problem.objects.annotate(
            attempts=Count("submissions"),
            solves=Count("submissions", filter=Q(submissions__passed=True)),
        )
    ]


def build_snapshot():
    """Leaderboard (all-time + today) + submission trends, ek hi payload me."""
    return {
        "rows": compute_rows("all"),
        "today": compute_rows("today"),
        "trends": compute_trends(),
        "online": presence["n"],
    }


# ───────────────────────── live push ─────────────────────────
def broadcast(group, payload):
    """Kisi bhi WebSocket group ko message bhejo."""
    async_to_sync(get_channel_layer().group_send)(group, {"type": "push", "payload": payload})


def activity_dict(a):
    return {"id": a.id, "kind": a.kind, "text": a.text, "points": a.points, "at": a.created_at.isoformat()}


def log_activity(kind, text, points=None, push=True):
    """Ticker ke liye record banao (aur chaho toh turant sab ko bhej do)."""
    item = activity_dict(Activity.objects.create(kind=kind, text=text, points=points))
    if push:
        broadcast("leaderboard", {"kind": "activity", "item": item})
    return item


def push_leaderboard(activity=None):
    payload = {"kind": "snapshot", **build_snapshot()}
    if activity:
        payload["activity"] = activity
    broadcast("leaderboard", payload)
