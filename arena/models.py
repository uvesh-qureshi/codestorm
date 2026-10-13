import uuid

from django.contrib.auth.models import User
from django.db import models

EXPERIENCE = [("Beginner", "Beginner"), ("Intermediate", "Intermediate"), ("Advanced", "Advanced")]


class Event(models.Model):
    name = models.CharField(max_length=150)
    start = models.DateTimeField()
    end = models.DateTimeField()
    venue = models.CharField(max_length=150, blank=True)

    def __str__(self):
        return self.name


class Session(models.Model):
    """Event ki timeline ka ek item (workshop, contest, lunch...)."""

    KINDS = [("workshop", "Workshop"), ("contest", "Contest"), ("talk", "Talk"), ("break", "Break")]

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="sessions")
    title = models.CharField(max_length=150)
    kind = models.CharField(max_length=20, choices=KINDS, default="talk")
    tag = models.CharField(max_length=40, blank=True, help_text="Chhota label: All participants, Workshop...")
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    location = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["start_time"]

    def __str__(self):
        return self.title


class Team(models.Model):
    name = models.CharField(max_length=80, unique=True)
    max_size = models.PositiveSmallIntegerField(default=4)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Participant(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="participant")
    display_name = models.CharField(max_length=80)
    skills = models.CharField(max_length=200, blank=True, help_text="Comma separated: Frontend,Backend")
    experience = models.CharField(max_length=20, choices=EXPERIENCE, default="Beginner")
    project_idea = models.CharField(max_length=140, blank=True)
    looking_for_team = models.BooleanField(default=True)
    team = models.ForeignKey(Team, null=True, blank=True, on_delete=models.SET_NULL, related_name="members")

    # QR check-in
    qr_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    checked_in = models.BooleanField(default=False)  # venue me kam se kam ek baar scan hua
    checked_in_at = models.DateTimeField(null=True, blank=True)

    def skill_list(self):
        return [s.strip() for s in self.skills.split(",") if s.strip()]

    @property
    def code(self):
        """Chhota readable ID (manual check-in ke liye): CS-0007"""
        return f"CS-{self.pk:04d}"

    @property
    def initials(self):
        parts = [w for w in self.display_name.replace("_", " ").split() if w]
        if not parts:
            return "?"
        if len(parts) == 1:
            return parts[0][:2].upper()
        return (parts[0][0] + parts[1][0]).upper()

    def __str__(self):
        return self.display_name


class CheckIn(models.Model):
    """Participant ka kisi ek session me scan hona. Ek session me ek hi baar."""

    participant = models.ForeignKey(Participant, on_delete=models.CASCADE, related_name="checkins")
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name="checkins")
    scanned_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="scans")
    method = models.CharField(max_length=10, default="qr")  # qr / manual
    scanned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("participant", "session")]
        ordering = ["-scanned_at"]


class Problem(models.Model):
    DIFFICULTY = [("easy", "Easy"), ("medium", "Medium"), ("hard", "Hard")]

    title = models.CharField(max_length=150)
    description = models.TextField()
    difficulty = models.CharField(max_length=10, choices=DIFFICULTY, default="easy")
    points = models.PositiveIntegerField(default=100)
    # [{"input": "3 5\n", "output": "8"}, ...]
    test_cases = models.JSONField(default=list)

    def __str__(self):
        return self.title


class Submission(models.Model):
    participant = models.ForeignKey(Participant, on_delete=models.CASCADE, related_name="submissions")
    problem = models.ForeignKey(Problem, on_delete=models.CASCADE, related_name="submissions")
    language = models.CharField(max_length=20, default="python")
    code = models.TextField()
    passed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class Duel(models.Model):
    STATUS = [("waiting", "Waiting"), ("active", "Active"), ("finished", "Finished")]

    player1 = models.ForeignKey(Participant, on_delete=models.CASCADE, related_name="duels_started")
    player2 = models.ForeignKey(Participant, null=True, blank=True, on_delete=models.CASCADE, related_name="duels_joined")
    problem = models.ForeignKey(Problem, on_delete=models.CASCADE)
    status = models.CharField(max_length=10, choices=STATUS, default="waiting")
    winner = models.ForeignKey(Participant, null=True, blank=True, on_delete=models.SET_NULL, related_name="duels_won")
    duration = models.PositiveIntegerField(default=300, help_text="seconds")
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)


class Activity(models.Model):
    """Live ticker ke liye: kisne kya kiya (solve, duel, check-in, team)."""

    kind = models.CharField(max_length=20)
    text = models.CharField(max_length=200)
    points = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class Invite(models.Model):
    """Matchmaker ka 'Connect' button: ek participant doosre ko team ke liye invite karta hai."""

    STATUS = [("pending", "Pending"), ("accepted", "Accepted"), ("declined", "Declined")]

    sender = models.ForeignKey(Participant, on_delete=models.CASCADE, related_name="invites_sent")
    receiver = models.ForeignKey(Participant, on_delete=models.CASCADE, related_name="invites_received")
    status = models.CharField(max_length=10, choices=STATUS, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
