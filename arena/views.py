import random
import uuid

from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .judge import check_solution, run_code
from .models import Activity, CheckIn, Duel, Event, Invite, Participant, Problem, Session, Submission, Team
from .services import (
    DUEL_WIN_POINTS,
    FIRST_SOLVE_BONUS,
    activity_dict,
    broadcast,
    build_snapshot,
    compute_rows,
    get_participant,
    log_activity,
    participant_dict,
    presence,
    push_leaderboard,
    qr_data_uri,
)

LEVELS = ("Beginner", "Intermediate", "Advanced")


def _skills(value):
    return ",".join(value) if isinstance(value, list) else (value or "")


# ───────────────────────── AUTH ─────────────────────────
@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    d = request.data
    username = (d.get("username") or "").strip()
    password = d.get("password") or ""
    if not username or len(password) < 4:
        return Response({"error": "Username aur password (kam se kam 4 characters) chahiye"}, status=400)
    if User.objects.filter(username=username).exists():
        return Response({"error": "Ye username pehle se hai"}, status=400)

    user = User.objects.create_user(username=username, password=password)
    Participant.objects.create(
        user=user,
        display_name=(d.get("display_name") or username).strip(),
        skills=_skills(d.get("skills", "")),
        experience=d.get("experience") if d.get("experience") in LEVELS else "Beginner",
        project_idea=(d.get("project_idea") or "").strip()[:140],
    )
    refresh = RefreshToken.for_user(user)
    return Response({"access": str(refresh.access_token), "refresh": str(refresh)}, status=201)


@api_view(["GET", "PATCH"])
def me(request):
    p = get_participant(request.user)
    if request.method == "PATCH":
        d = request.data
        if "skills" in d:
            p.skills = _skills(d["skills"])
        if "looking_for_team" in d:
            p.looking_for_team = bool(d["looking_for_team"])
        if d.get("display_name"):
            p.display_name = d["display_name"].strip()
        if d.get("experience") in LEVELS:
            p.experience = d["experience"]
        if "project_idea" in d:
            p.project_idea = (d["project_idea"] or "").strip()[:140]
        p.save()
    return Response(participant_dict(p, with_qr=True))


# ───────────────────── HOME: stats, featured match, activity ─────────────────────
@api_view(["GET"])
def stats(request):
    event = Event.objects.first()
    return Response(
        {
            "online": presence["n"],
            "challenges": Problem.objects.count(),
            "sessions": event.sessions.count() if event else 0,
            "participants": Participant.objects.filter(user__is_staff=False).count(),
        }
    )


@api_view(["GET"])
def activity(request):
    return Response([activity_dict(a) for a in Activity.objects.all()[:20]])


@api_view(["GET"])
def leaderboard(request):
    return Response(build_snapshot())


def _player_card(p, scores):
    return {"id": p.id, "name": p.display_name, "initials": p.initials, "xp": scores.get(p.id, 0)}


@api_view(["GET"])
def featured(request):
    """Home page ka 'Featured match': abhi chal raha duel, nahi toh sabse naya khatam hua duel."""
    for d in Duel.objects.filter(status="active"):
        refresh_duel(d)
    d = Duel.objects.filter(status="active").select_related("player1", "player2", "problem").order_by("-started_at").first()
    live = d is not None
    if not d:
        d = (
            Duel.objects.filter(status="finished", player2__isnull=False)
            .select_related("player1", "player2", "problem")
            .order_by("-created_at")
            .first()
        )
    if not d:
        return Response({"duel": None})

    scores = {r["id"]: r["score"] for r in compute_rows("all")}
    example = d.problem.test_cases[0] if d.problem.test_cases else {"input": "", "output": ""}
    return Response(
        {
            "duel": {
                "id": d.id,
                "code": f"#DUEL-{d.id:04d}",
                "live": live,
                "status": d.status,
                "title": d.problem.title,
                "difficulty": d.problem.difficulty,
                "seconds_left": seconds_left(d) or 0,
                "p1": _player_card(d.player1, scores),
                "p2": _player_card(d.player2, scores),
                "winner_id": d.winner_id,
                "example_input": example["input"].strip().replace("\n", " ⏎ "),
                "example_output": str(example["output"]).strip(),
                "tests": len(d.problem.test_cases),
            }
        }
    )


# ───────────────────── PROBLEMS ─────────────────────
def problem_public(pr):
    """Hidden test cases nahi bhejte - sirf pehla example."""
    example = pr.test_cases[0] if pr.test_cases else {"input": "", "output": ""}
    return {
        "id": pr.id,
        "title": pr.title,
        "description": pr.description,
        "difficulty": pr.difficulty,
        "points": pr.points,
        "example_input": example["input"],
        "example_output": example["output"],
    }


@api_view(["GET"])
def problems(request):
    p = get_participant(request.user)
    solved = set(p.submissions.filter(passed=True).values_list("problem_id", flat=True))
    first = {}
    for s in Submission.objects.filter(passed=True).select_related("participant").order_by("created_at", "id"):
        first.setdefault(s.problem_id, s.participant.display_name)
    return Response(
        [
            {**problem_public(x), "solved": x.id in solved, "first_solver": first.get(x.id)}
            for x in Problem.objects.all()
        ]
    )


@api_view(["POST"])
def run_sample(request, problem_id):
    """'Run sample': sirf pehle example pe chalao. Score/submission pe koi asar nahi."""
    problem = get_object_or_404(Problem, pk=problem_id)
    case = problem.test_cases[0] if problem.test_cases else {"input": "", "output": ""}
    res = run_code(request.data.get("code", ""), request.data.get("language", "python"), case["input"])
    got = res["stdout"].strip()
    expected = str(case["output"]).strip()
    return Response(
        {
            "passed": bool(res["ok"] and got == expected),
            "input": case["input"],
            "expected": expected,
            "output": got,
            "error": res["stderr"],
            "ms": res.get("ms", 0),
        }
    )


@api_view(["POST"])
def submit(request, problem_id):
    problem = get_object_or_404(Problem, pk=problem_id)
    p = get_participant(request.user)
    code = request.data.get("code", "")
    language = request.data.get("language", "python")

    first_ever = not Submission.objects.filter(problem=problem, passed=True).exists()
    result = check_solution(problem, code, language)
    already_solved = p.submissions.filter(problem=problem, passed=True).exists()
    Submission.objects.create(
        participant=p, problem=problem, language=language, code=code, passed=result["passed"]
    )

    item = None
    result["bonus"] = 0
    if result["passed"] and not already_solved:
        result["bonus"] = FIRST_SOLVE_BONUS if first_ever else 0
        result["points"] = problem.points + result["bonus"]
        item = log_activity("solve", f"{p.display_name} solved “{problem.title}”", result["points"], push=False)
    push_leaderboard(item)  # sab browsers me leaderboard + ticker live update
    return Response(result)


# ───────────────────────── 1v1 DUEL ─────────────────────────
def seconds_left(d):
    if d.status != "active":
        return None
    used = int((timezone.now() - d.started_at).total_seconds())
    return max(0, d.duration - used)


def refresh_duel(d):
    """Time khatam ho gaya toh duel draw me khatam."""
    if d.status == "active" and seconds_left(d) == 0:
        d.status = "finished"
        d.save()
        broadcast(f"duel_{d.id}", {"kind": "finished"})
        broadcast("leaderboard", {"kind": "duel"})
    return d


def duel_dict(d, me):
    return {
        "id": d.id,
        "status": d.status,
        "seconds_left": seconds_left(d),
        "duration": d.duration,
        "problem": problem_public(d.problem) if d.status != "waiting" else None,
        "me": me.id,
        "player1": participant_dict(d.player1),
        "player2": participant_dict(d.player2) if d.player2 else None,
        "winner": d.winner.display_name if d.winner else None,
        "winner_id": d.winner_id,
    }


@api_view(["POST"])
def duel_quick(request):
    """Quick match: koi waiting hai toh join, warna naya duel bana ke wait."""
    me = get_participant(request.user)
    mine = Duel.objects.filter(player1=me, status="waiting").first()
    if mine:
        return Response(duel_dict(mine, me))

    waiting = Duel.objects.filter(status="waiting").exclude(player1=me).order_by("created_at").first()
    if waiting:
        waiting.player2 = me
        waiting.status = "active"
        waiting.started_at = timezone.now()
        waiting.save()
        broadcast(f"duel_{waiting.id}", {"kind": "start"})
        log_activity("duel", f"{waiting.player1.display_name} vs {me.display_name}: duel started")
        broadcast("leaderboard", {"kind": "duel"})
        return Response(duel_dict(waiting, me))

    problems_list = list(Problem.objects.all())
    if not problems_list:
        return Response({"error": "Koi problem nahi hai"}, status=400)
    duel = Duel.objects.create(player1=me, problem=random.choice(problems_list))
    return Response(duel_dict(duel, me), status=201)


@api_view(["GET"])
def duel_detail(request, duel_id):
    me = get_participant(request.user)
    d = refresh_duel(get_object_or_404(Duel, pk=duel_id))
    if me.id not in (d.player1_id, d.player2_id):
        return Response({"error": "Ye tumhara duel nahi hai"}, status=403)
    return Response(duel_dict(d, me))


@api_view(["POST"])
def duel_submit(request, duel_id):
    me = get_participant(request.user)
    d = refresh_duel(get_object_or_404(Duel, pk=duel_id))
    if me.id not in (d.player1_id, d.player2_id):
        return Response({"error": "Ye tumhara duel nahi hai"}, status=403)
    if d.status != "active":
        return Response({"error": "Duel active nahi hai"}, status=400)

    result = check_solution(d.problem, request.data.get("code", ""), request.data.get("language", "python"))
    group = f"duel_{d.id}"
    if result["passed"]:
        d.status = "finished"
        d.winner = me
        d.save()
        other = d.player2 if me.id == d.player1_id else d.player1
        broadcast(group, {"kind": "finished", "winner": me.display_name})
        item = log_activity("duel", f"{me.display_name} won a 1v1 duel vs {other.display_name}", DUEL_WIN_POINTS, push=False)
        push_leaderboard(item)
        broadcast("leaderboard", {"kind": "duel"})
    else:
        broadcast(
            group,
            {"kind": "attempt", "who": me.display_name, "passed": result["passed_count"], "total": result["total"]},
        )
    return Response(result)


# ───────────────────── SCHEDULE + QR CHECK-IN ─────────────────────
@api_view(["GET"])
def schedule(request):
    event = Event.objects.first()
    if not event:
        return Response({"event": None, "sessions": []})
    return Response(
        {
            "event": {"name": event.name, "venue": event.venue},
            "sessions": [
                {
                    "id": s.id,
                    "title": s.title,
                    "kind": s.kind,
                    "tag": s.tag,
                    "start": s.start_time.isoformat(),
                    "end": s.end_time.isoformat(),
                    "location": s.location,
                    "checked_in": s.checkins.count(),
                }
                for s in event.sessions.all()
            ],
        }
    )


def resolve_participant(q):
    """QR token (UUID) ya chhota ID (CS-0007) se participant dhundo."""
    q = (q or "").strip()
    if not q:
        return None
    if q.upper().startswith("CS-") and q[3:].isdigit():
        return Participant.objects.filter(pk=int(q[3:])).first()
    try:
        token = uuid.UUID(q)
    except ValueError:
        return None
    return Participant.objects.filter(qr_token=token).first()


def _staff_only(request):
    if not request.user.is_staff:
        return Response({"error": "Sirf coordinator ye kar sakta hai"}, status=403)
    return None


@api_view(["POST"])
def checkin(request):
    """Coordinator participant ka QR (ya ID) scan karke ek session me attendance mark karta hai."""
    denied = _staff_only(request)
    if denied:
        return denied

    p = resolve_participant(request.data.get("token"))
    if not p:
        return Response({"error": "Invalid QR code. Ye participant system me nahi mila"}, status=404)
    if p.user.is_staff:
        return Response({"error": "Ye staff pass hai, check-in ke liye nahi"}, status=400)
    session = Session.objects.filter(pk=request.data.get("session") or 0).first()
    if not session:
        return Response({"error": "Pehle session select karo"}, status=400)

    method = "manual" if request.data.get("method") == "manual" else "qr"
    obj, created = CheckIn.objects.get_or_create(
        participant=p, session=session, defaults={"scanned_by": request.user, "method": method}
    )
    if not p.checked_in:
        p.checked_in = True
        p.checked_in_at = timezone.now()
        p.save(update_fields=["checked_in", "checked_in_at"])

    total = Participant.objects.filter(user__is_staff=False).count()
    count = session.checkins.count()
    if created:
        item = activity_dict(
            Activity.objects.create(kind="checkin", text=f"{p.display_name} checked in to {session.title}")
        )
        broadcast(
            "leaderboard",
            {
                "kind": "checkin",
                "participant_id": p.id,
                "session": session.id,
                "session_title": session.title,
                "name": p.display_name,
                "count": count,
                "total": total,
                "item": item,
            },
        )

    return Response(
        {
            "name": p.display_name,
            "code": p.code,
            "initials": p.initials,
            "team": p.team.name if p.team else None,
            "skills": p.skill_list(),
            "session": session.title,
            "already": not created,
            "scanned_at": obj.scanned_at.isoformat(),
            "scanned_by": obj.scanned_by.username if obj.scanned_by else None,
            "method": obj.method,
            "count": count,
            "total": total,
        }
    )


@api_view(["GET"])
def checkins(request):
    """Ek session me ab tak kaun scan ho chuka hai (coordinator ke liye)."""
    denied = _staff_only(request)
    if denied:
        return denied
    session = get_object_or_404(Session, pk=request.GET.get("session") or 0)
    rows = session.checkins.select_related("participant__team", "scanned_by")
    return Response(
        {
            "session": {"id": session.id, "title": session.title},
            "count": rows.count(),
            "total": Participant.objects.filter(user__is_staff=False).count(),
            "items": [
                {
                    "id": c.participant_id,
                    "name": c.participant.display_name,
                    "initials": c.participant.initials,
                    "code": c.participant.code,
                    "team": c.participant.team.name if c.participant.team else None,
                    "method": c.method,
                    "at": c.scanned_at.isoformat(),
                }
                for c in rows
            ],
        }
    )


@api_view(["GET"])
def lookup(request):
    """Coordinator: naam / ID se participant dhundo (QR banane ya manual check-in ke liye)."""
    denied = _staff_only(request)
    if denied:
        return denied
    q = (request.GET.get("q") or "").strip()
    if not q:
        return Response([])
    qs = Participant.objects.select_related("team", "user").filter(user__is_staff=False)
    exact = resolve_participant(q)
    if exact and not exact.user.is_staff:
        found = [exact]
    else:
        found = list(qs.filter(display_name__icontains=q) | qs.filter(user__username__icontains=q))[:6]
    return Response([{**participant_dict(p), "qr": qr_data_uri(str(p.qr_token))} for p in found])


# ───────────────────── TEAMS + MATCHMAKER + INVITES ─────────────────────
def team_dict(t):
    members = list(t.members.all())
    return {
        "id": t.id,
        "name": t.name,
        "max_size": t.max_size,
        "open_slots": t.max_size - len(members),
        "members": [{"id": m.id, "display_name": m.display_name, "skills": m.skill_list()} for m in members],
    }


def unique_team_name(base):
    name, i = base[:80], 2
    while Team.objects.filter(name__iexact=name).exists():
        name = f"{base[:74]} {i}"
        i += 1
    return name


@api_view(["GET", "POST"])
def teams(request):
    me = get_participant(request.user)
    if request.method == "POST":
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"error": "Team ka naam do"}, status=400)
        if me.team:
            return Response({"error": "Pehle apni current team chhodo"}, status=400)
        if Team.objects.filter(name__iexact=name).exists():
            return Response({"error": "Is naam ki team already hai"}, status=400)
        me.team = Team.objects.create(name=name)
        me.save()
        item = log_activity("team", f"{me.display_name} created team {me.team.name}", push=False)
        push_leaderboard(item)
    return Response(
        {"my_team": me.team_id, "teams": [team_dict(t) for t in Team.objects.prefetch_related("members")]}
    )


@api_view(["POST"])
def team_join(request, team_id):
    me = get_participant(request.user)
    team = get_object_or_404(Team, pk=team_id)
    if me.team_id:
        return Response({"error": "Pehle apni current team chhodo"}, status=400)
    if team.members.count() >= team.max_size:
        return Response({"error": "Team full hai"}, status=400)
    me.team = team
    me.save()
    item = log_activity("team", f"{me.display_name} joined {team.name}", push=False)
    push_leaderboard(item)
    return Response({"ok": True})


@api_view(["POST"])
def team_leave(request):
    me = get_participant(request.user)
    team = me.team
    me.team = None
    me.save()
    if team and team.members.count() == 0:
        team.delete()  # khaali team hata do
    push_leaderboard()
    return Response({"ok": True})


@api_view(["GET"])
def matchmaker(request):
    """Solo participants dhundo. /matchmaker/?need=Frontend,Backend&experience=Advanced"""
    me = get_participant(request.user)
    need = [s.strip().lower() for s in request.GET.get("need", "").split(",") if s.strip()]
    level = request.GET.get("experience", "")

    sent = set(Invite.objects.filter(sender=me, status="pending").values_list("receiver_id", flat=True))
    got = set(Invite.objects.filter(receiver=me, status="pending").values_list("sender_id", flat=True))

    results = []
    solos = (
        Participant.objects.select_related("team")
        .filter(team__isnull=True, looking_for_team=True, user__is_staff=False)
        .exclude(pk=me.pk)
    )
    for p in solos:
        have = [s.lower() for s in p.skill_list()]
        matched = [s for s in need if s in have]
        if need and not matched:
            continue
        if level and p.experience != level:
            continue
        invite = "sent" if p.id in sent else "incoming" if p.id in got else None
        results.append({**participant_dict(p), "matched": matched, "score": len(matched), "invite": invite})
    results.sort(key=lambda r: (-r["score"], r["display_name"]))
    return Response(results)


@api_view(["POST"])
def connect(request, participant_id):
    """'Connect' button: doosre participant ko team ke liye invite bhejo."""
    me = get_participant(request.user)
    other = get_object_or_404(Participant, pk=participant_id, user__is_staff=False)
    if other.pk == me.pk:
        return Response({"error": "Khud ko connect nahi kar sakte"}, status=400)
    if me.team_id and me.team_id == other.team_id:
        return Response({"error": "Aap dono ek hi team me ho"}, status=400)
    if me.team_id and other.team_id:
        return Response({"error": "Dono pehle se alag teams me ho"}, status=400)
    if Invite.objects.filter(sender=me, receiver=other, status="pending").exists():
        return Response({"error": "Request pehle se bheji hui hai"}, status=400)
    if Invite.objects.filter(sender=other, receiver=me, status="pending").exists():
        return Response({"error": "Inki request tumhare paas aayi hui hai. Invites me accept karo"}, status=400)
    Invite.objects.create(sender=me, receiver=other)
    return Response({"ok": True})


def _invite_dict(inv, other):
    return {"id": inv.id, "status": inv.status, "at": inv.created_at.isoformat(), "who": participant_dict(other)}


@api_view(["GET"])
def invites(request):
    me = get_participant(request.user)
    incoming = Invite.objects.filter(receiver=me, status="pending").select_related("sender__team")
    outgoing = Invite.objects.filter(sender=me).select_related("receiver__team")[:10]
    return Response(
        {
            "incoming": [_invite_dict(i, i.sender) for i in incoming],
            "outgoing": [_invite_dict(i, i.receiver) for i in outgoing],
        }
    )


@api_view(["POST"])
def invite_respond(request, invite_id):
    me = get_participant(request.user)
    inv = get_object_or_404(Invite, pk=invite_id, receiver=me, status="pending")
    action = request.data.get("action")
    if action == "decline":
        inv.status = "declined"
        inv.save()
        return Response({"ok": True})
    if action != "accept":
        return Response({"error": "action accept ya decline hona chahiye"}, status=400)

    s, r = inv.sender, inv.receiver
    if s.team_id and r.team_id and s.team_id != r.team_id:
        return Response({"error": "Dono pehle se alag teams me ho"}, status=400)
    team = s.team or r.team
    if team is None:
        team = Team.objects.create(name=unique_team_name(f"{s.display_name}'s squad"))
    joining = [x for x in (s, r) if x.team_id != team.id]
    if team.members.count() + len(joining) > team.max_size:
        return Response({"error": "Team full hai"}, status=400)
    for x in joining:
        x.team = team
        x.save()
    inv.status = "accepted"
    inv.save()
    item = log_activity("team", f"{s.display_name} and {r.display_name} teamed up in {team.name}", push=False)
    push_leaderboard(item)
    return Response({"ok": True, "team": team.name})
