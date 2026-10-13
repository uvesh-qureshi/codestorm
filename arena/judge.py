"""
Code run karne wala 'judge'.

Do modes:
1. LOCAL (default)  - Python/JavaScript code subprocess me 5 sec timeout ke saath chalta hai.
                      ⚠️ Sirf demo/college use ke liye - untrusted code ke liye safe nahi.
2. JUDGE0 (sandbox) - .env me JUDGE0_URL set karo (jaise https://judge0-ce.p.rapidapi.com ya
                      apna self-hosted URL) toh code Judge0 ke sandbox me chalega. Zyada safe.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time

import requests

TIMEOUT = 5  # seconds

JUDGE0_LANG_IDS = {"python": 71, "javascript": 63, "cpp": 54, "java": 62}


def run_code(code, language, stdin=""):
    """Return dict: {ok, stdout, stderr, ms}"""
    if os.environ.get("JUDGE0_URL"):
        return _run_judge0(code, language, stdin)
    return _run_local(code, language, stdin)


def _run_local(code, language, stdin):
    if language == "python":
        ext, cmd = ".py", [sys.executable, "-I"]
    elif language == "javascript":
        node = shutil.which("node")
        if not node:
            return {"ok": False, "stdout": "", "stderr": "Node.js installed nahi hai", "ms": 0}
        ext, cmd = ".js", [node]
    else:
        return {"ok": False, "stdout": "", "stderr": "Local mode me sirf python/javascript chalta hai", "ms": 0}

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "main" + ext)
        with open(path, "w", encoding="utf-8") as f:
            f.write(code)
        started = time.perf_counter()
        try:
            r = subprocess.run(
                cmd + [path], input=stdin, capture_output=True, text=True, timeout=TIMEOUT, cwd=tmp
            )
            ms = int((time.perf_counter() - started) * 1000)
            return {"ok": r.returncode == 0, "stdout": r.stdout, "stderr": r.stderr[-800:], "ms": ms}
        except subprocess.TimeoutExpired:
            return {"ok": False, "stdout": "", "stderr": f"Time limit exceeded ({TIMEOUT}s)", "ms": TIMEOUT * 1000}


def _run_judge0(code, language, stdin):
    lang_id = JUDGE0_LANG_IDS.get(language)
    if not lang_id:
        return {"ok": False, "stdout": "", "stderr": "Language supported nahi hai", "ms": 0}
    headers = {}
    if os.environ.get("JUDGE0_KEY"):  # RapidAPI key (optional)
        headers = {
            "X-RapidAPI-Key": os.environ["JUDGE0_KEY"],
            "X-RapidAPI-Host": os.environ.get("JUDGE0_HOST", ""),
        }
    try:
        r = requests.post(
            os.environ["JUDGE0_URL"].rstrip("/") + "/submissions?base64_encoded=false&wait=true",
            json={"source_code": code, "language_id": lang_id, "stdin": stdin},
            headers=headers,
            timeout=30,
        ).json()
        err = (r.get("stderr") or r.get("compile_output") or "") or ""
        ok = (r.get("status") or {}).get("id") == 3
        ms = int(float(r.get("time") or 0) * 1000)
        return {"ok": ok, "stdout": r.get("stdout") or "", "stderr": err[-800:], "ms": ms}
    except Exception as e:  # network error etc.
        return {"ok": False, "stdout": "", "stderr": f"Judge0 error: {e}", "ms": 0}


def check_solution(problem, code, language):
    """Saare test cases chala ke result do."""
    cases = problem.test_cases
    passed = 0
    message = ""
    total_ms = 0
    for i, case in enumerate(cases, start=1):
        res = run_code(code, language, case["input"])
        total_ms += res.get("ms", 0)
        got = res["stdout"].strip()
        if res["ok"] and got == str(case["output"]).strip():
            passed += 1
        elif not message:
            if res["stderr"]:
                message = f"Test {i}: error\n{res['stderr']}"
            else:
                message = f"Test {i}: galat answer. Expected '{case['output']}', mila '{got}'"
    return {
        "passed": passed == len(cases) and len(cases) > 0,
        "passed_count": passed,
        "total": len(cases),
        "message": message,
        "ms": total_ms,
    }
