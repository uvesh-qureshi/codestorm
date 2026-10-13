"""Demo data: python manage.py seed_demo

Dobara chalane se koi data duplicate nahi hota. Schedule har baar "abhi" ke hisaab se
set ho jaata hai, isliye hamesha ek session LIVE dikhega.
"""
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from arena.models import Activity, CheckIn, Duel, Event, Participant, Problem, Session, Submission, Team

PROBLEMS = [
    ("Sum of Two Numbers", "Do integers ek line me diye hain. Unka sum print karo.", "easy", 100,
     [("3 5\n", "8"), ("10 -4\n", "6"), ("0 0\n", "0")]),
    ("Reverse String", "Ek string di hai. Use ulta karke print karo.", "easy", 100,
     [("hello\n", "olleh"), ("CodeStorm\n", "mrotSedoC"), ("a\n", "a")]),
    ("Palindrome Check", "String palindrome hai toh YES, warna NO print karo.", "easy", 150,
     [("madam\n", "YES"), ("hello\n", "NO"), ("racecar\n", "YES")]),
    ("Max of N Numbers", "Pehli line me N, doosri line me N numbers. Sabse bada print karo.", "medium", 200,
     [("5\n3 9 2 7 1\n", "9"), ("3\n-5 -2 -9\n", "-2"), ("1\n42\n", "42")]),
    ("Nth Fibonacci", "N diya hai. N-th Fibonacci number print karo (F1 = 1, F2 = 1).", "medium", 250,
     [("10\n", "55"), ("1\n", "1"), ("20\n", "6765")]),
    ("Two Sum",
     "Pehli line me N, doosri me N numbers, teesri me target. Wo do indices (0-based, chhota pehle) "
     "print karo jinka sum target ho. Format: 'i j'.", "medium", 120,
     [("4\n2 7 11 15\n9\n", "0 1"), ("3\n3 2 4\n6\n", "1 2"), ("2\n3 3\n6\n", "0 1")]),
]

# username, display name, skills, experience, project idea
USERS = [
    ("alice", "Alice", "Frontend,UI/UX", "Advanced", "Real-time dashboard"),
    ("bob", "Bob", "Backend,DevOps", "Intermediate", "Scalable event API"),
    ("carol", "Carol", "Machine Learning,Data", "Advanced", "Smart code reviewer"),
    ("dave", "Dave", "Backend,Machine Learning", "Intermediate", "Hackathon match predictor"),
    ("eve", "Eve", "Frontend,Mobile", "Beginner", "Accessible hackathon app"),
    ("frank", "Frank", "Mobile,Backend", "Intermediate", "Offline-first study app"),
    ("faize", "Faize", "Frontend,Backend", "Intermediate", "Live hackathon hub"),
    ("uvesh", "Uvesh", "Backend,Machine Learning", "Intermediate", "Live hackathon hub"),
]


def r5(dt):
    """5 minute ke multiple pe round (schedule clean dikhe)."""
    return dt.replace(minute=dt.minute // 5 * 5, second=0, microsecond=0)


class Command(BaseCommand):
    help = "Demo event, problems, users, leaderboard aur ticker data banata hai"

    def handle(self, *args, **options):
        now = timezone.now()

        # ── Event + schedule (abhi ke hisaab se: ek session LIVE, baaki upcoming/done) ──
        start = r5(now)
        plan = [
            # title, kind, tag, location, start offset (min), duration (min)
            ("Opening Ceremony & Briefing", "talk", "All participants", "Main Stage", -80, 20),
            ("Speed Coding: Round 1", "contest", "Competition", "Arena 01", -20, 180),
            ("Build with AI Workshop", "workshop", "Workshop", "Lab B", 170, 60),
            ("Demo Day & Awards", "talk", "Finale", "Main Stage", 250, 45),
        ]
        event = Event.objects.first()
        if not event:
            event = Event.objects.create(
                name="CodeStorm 2026", start=start - timedelta(minutes=80),
                end=start + timedelta(minutes=295), venue="Main Auditorium",
            )
        else:
            event.start, event.end = start - timedelta(minutes=80), start + timedelta(minutes=295)
            event.save()
        for title, kind, tag, loc, off, dur in plan:
            s, _ = Session.objects.get_or_create(event=event, title=title, defaults={
                "kind": kind, "start_time": start, "end_time": start})
            s.kind, s.tag, s.location = kind, tag, loc
            s.start_time = start + timedelta(minutes=off)
            s.end_time = s.start_time + timedelta(minutes=dur)
            s.save()
        # purane demo sessions hata do (naye plan me nahi hain)
        Session.objects.filter(event=event).exclude(title__in=[p[0] for p in plan]).delete()

        # ── Problems ──
        for title, desc, diff, pts, cases in PROBLEMS:
            Problem.objects.get_or_create(title=title, defaults={
                "description": desc, "difficulty": diff, "points": pts,
                "test_cases": [{"input": i, "output": o} for i, o in cases],
            })

        # ── Coordinator (staff) ──
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser("admin", "admin@example.com", "admin123")

        # ── Participants ──
        for username, name, skills, level, idea in USERS:
            u = User.objects.filter(username=username).first()
            if not u:
                u = User.objects.create_user(username, password="pass1234")
                Participant.objects.create(user=u, display_name=name, skills=skills, experience=level, project_idea=idea)
            else:
                Participant.objects.filter(user=u, project_idea="").update(experience=level, project_idea=idea)

        # ── Team ──
        if not Team.objects.exists():
            t = Team.objects.create(name="Byte Bandits")
            Participant.objects.filter(user__username__in=["alice", "bob"]).update(team=t)
        if not Team.objects.filter(name="Faize & Uvesh").exists():
            t2 = Team.objects.create(name="Faize & Uvesh")
            Participant.objects.filter(user__username__in=["faize", "uvesh"]).update(team=t2)

        # ── Solves (leaderboard bharne ke liye) ──
        if not Submission.objects.exists():
            probs = list(Problem.objects.order_by("id"))
            plan_solves = {"alice": 4, "bob": 3, "carol": 2, "dave": 1}
            k = 0
            for username, n in plan_solves.items():
                p = Participant.objects.get(user__username=username)
                for pr in probs[:n]:
                    sub = Submission.objects.create(participant=p, problem=pr, code="# seeded", passed=True)
                    Submission.objects.filter(pk=sub.pk).update(created_at=now - timedelta(seconds=(40 - k) * 12))
                    k += 1
            p = Participant.objects.get(user__username="eve")
            Submission.objects.create(participant=p, problem=probs[0], code="# seeded", passed=False)

        # ── Ek khatam hua duel (Featured match me dikhega) ──
        if not Duel.objects.exists():
            c = Participant.objects.get(user__username="carol")
            d = Participant.objects.get(user__username="dave")
            Duel.objects.create(
                player1=c, player2=d, problem=Problem.objects.get(title="Reverse String"),
                status="finished", winner=d, started_at=now - timedelta(minutes=6),
            )

        # ── Session check-in: Bob aur Carol pehle session me scan ho chuke (already-scanned demo) ──
        first = Session.objects.filter(event=event).order_by("start_time").first()
        admin = User.objects.get(username="admin")
        if first and not CheckIn.objects.exists():
            for username in ("bob", "carol"):
                p = Participant.objects.get(user__username=username)
                CheckIn.objects.create(participant=p, session=first, scanned_by=admin)
                p.checked_in, p.checked_in_at = True, now - timedelta(minutes=70)
                p.save()

        # ── Ticker history ──
        if not Activity.objects.exists():
            items = []
            for s in Submission.objects.filter(passed=True).select_related("participant", "problem").order_by("created_at"):
                items.append(("solve", f"{s.participant.display_name} solved “{s.problem.title}”", s.problem.points, s.created_at))
            items.append(("duel", "Dave won a 1v1 duel vs Carol", 50, now - timedelta(minutes=5)))
            items.append(("team", "Alice created team Byte Bandits", None, now - timedelta(minutes=30)))
            for kind, text, pts, at in sorted(items, key=lambda x: x[3]):
                a = Activity.objects.create(kind=kind, text=text, points=pts)
                Activity.objects.filter(pk=a.pk).update(created_at=at)
            for username in ("bob", "carol"):
                a = Activity.objects.create(kind="checkin", text=f"{username.title()} checked in to {first.title}")
                Activity.objects.filter(pk=a.pk).update(created_at=now - timedelta(minutes=70))

        self.stdout.write(self.style.SUCCESS(
            "Demo ready!  Coordinator: admin / admin123   |   Participants: alice, bob, carol, dave, eve, frank, faize, uvesh / pass1234"
        ))
