import asyncio
import json
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AssistantMessage, ToolUseBlock, TextBlock, ResultMessage, create_sdk_mcp_server, tool
import subprocess
import os

# Environment-specific configuration
LA_API_URL = os.getenv("LA_API_URL", "https://my.living-apps.de/rest")
LA_FRONTEND_URL = os.getenv("LA_FRONTEND_URL", "https://my.living-apps.de")

async def main():
    # Skills and CLAUDE.md are loaded automatically by Claude SDK from cwd
    # No manual instruction loading needed - the SDK reads:
    # - /home/user/app/CLAUDE.md (copied from SANDBOX_PROMPT.md)
    # - /home/user/app/.claude/skills/ (copied from sandbox_skills/)

    def run_git_cmd(cmd: str):
        """Executes a Git command and throws an error on failure"""
        print(f"[DEPLOY] Executing: {cmd}")
        result = subprocess.run(
            cmd,
            shell=True,
            cwd="/home/user/app",
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            raise Exception(f"Git Error ({cmd}): {result.stderr}")
        return result.stdout

    @tool("deploy_to_github",
    "Initializes Git, commits EVERYTHING, and pushes it to the configured repository. Use this ONLY at the very end.",
    {})
    async def deploy_to_github(args):
        import time
        t_deploy_start = time.time()
        try:
            run_git_cmd("git config --global user.email 'lilo@livinglogic.de'")
            run_git_cmd("git config --global user.name 'Lilo'")
            
            git_push_url = os.getenv('GIT_PUSH_URL')
            appgroup_id = os.getenv('REPO_NAME')
            livingapps_api_key = os.getenv('LIVINGAPPS_API_KEY')
            
            # Prüfe ob Repo existiert und übernehme .git History
            print("[DEPLOY] Prüfe ob Repo bereits existiert...")
            try:
                run_git_cmd(f"git clone {git_push_url} /tmp/old_repo")
                run_git_cmd("cp -r /tmp/old_repo/.git /home/user/app/.git")
                print("[DEPLOY] ✅ History vom existierenden Repo übernommen")
            except:
                # Neues Repo - von vorne initialisieren
                print("[DEPLOY] ✅ Neues Repo wird initialisiert")
                run_git_cmd("git init")
                run_git_cmd("git checkout -b main")
                run_git_cmd(f"git remote add origin {git_push_url}")
            
            # Mit HOME=/home/user/app schreibt das SDK direkt nach /home/user/app/.claude/
            # Kein Kopieren nötig! .claude ist bereits im Repo-Ordner.
            print("[DEPLOY] 💾 Session wird mit Code gepusht (HOME=/home/user/app)")
            
            # Session ID wird später von ResultMessage gespeichert
            # Hier nur prüfen ob .claude existiert
            check_result = subprocess.run(
                "ls /home/user/app/.claude 2>&1",
                shell=True,
                capture_output=True,
                text=True
            )
            if check_result.returncode == 0:
                print("[DEPLOY] ✅ .claude/ vorhanden - wird mit gepusht")
            else:
                print("[DEPLOY] ⚠️ .claude/ nicht gefunden")
            
            # Neuen Code committen (includes .claude/ direkt im Repo)
            run_git_cmd("git add -A")
            # Force add .claude (exclude debug/ - may contain secrets)
            subprocess.run("git add -f .claude ':!.claude/debug' .claude_session_id 2>/dev/null", shell=True, cwd="/home/user/app")
            run_git_cmd("git commit -m 'Lilo Auto-Deploy' --allow-empty")
            run_git_cmd("git push origin main")
            
            t_push_done = time.time()
            print(f"[DEPLOY] ✅ Push erfolgreich! ({t_push_done - t_deploy_start:.1f}s)")
            
            # Dashboard-Link-Aktivierung wird vom Service übernommen (hat VPN-Zugriff)
            print("[DEPLOY] ℹ️ Dashboard-Links werden vom Service aktiviert")

            t_deploy_total = time.time() - t_deploy_start
            return {
                "content": [{"type": "text", "text": f"✅ Deployment erfolgreich! ({t_deploy_total:.1f}s)"}]
            }

        except Exception as e:
            return {"content": [{"type": "text", "text": f"Deployment Failed: {str(e)}"}], "is_error": True}

    deployment_server = create_sdk_mcp_server(
        name="deployment",
        version="1.0.0",
        tools=[deploy_to_github]
    )

    # 3. Optionen konfigurieren
    # setting_sources=["project"] is REQUIRED to load CLAUDE.md and .claude/skills/ from cwd
    options = ClaudeAgentOptions(
        system_prompt={
            "type": "preset",
            "preset": "claude_code",
            "append": (
                "MANDATORY RULES (highest priority):\n"
                "- No design_brief.md — analyze data in 1-2 sentences, then implement directly\n"
                "- DashboardOverview.tsx: Call Read('src/pages/DashboardOverview.tsx') FIRST, then Write ONCE with complete content. Never read back after writing.\n"
                "- NEVER use Bash for file operations (no cat, echo, heredoc, >, >>). ALWAYS use Read/Write/Edit tools. If a tool fails, retry with the SAME tool — never fall back to Bash.\n"
                "- index.css: NEVER touch — pre-generated design system (font, colors, sidebar). Use existing tokens.\n"
                "- Layout.tsx: NEVER Write, only Edit (only change APP_TITLE/APP_SUBTITLE)\n"
                "- CRUD pages/dialogs: NEVER touch — complete with all logic\n"
                "- App.tsx, PageShell.tsx, StatCard.tsx, ConfirmDialog.tsx: NEVER touch\n"
                "- No Read-back after Write/Edit\n"
                "- No Read of files whose contents are in .scaffold_context\n"
                "- Read .scaffold_context FIRST to understand all generated files\n"
                "- useDashboardData.ts, enriched.ts, enrich.ts, formatters.ts, ai.ts, chat-context.ts, ChatWidget.tsx: NEVER touch — use as-is\n"
                "- src/config/ai-features.ts: MAY edit — set AI_PHOTO_SCAN['Entity'] = true to enable photo scan in dialogs\n"
                "- Dashboard is the PRIMARY WORKSPACE — build interactive domain-specific UI, not an info page\n"
                "- ALWAYS reuse pre-generated {Entity}Dialog from '@/components/dialogs/{Entity}Dialog' for create/edit forms in the dashboard — never build custom forms\n"
                "- NEVER use TodoWrite — no task lists, no planning, just implement directly"
            ),
        },
        setting_sources=["project"],  # Required: loads CLAUDE.md and .claude/skills/
        mcp_servers={"deploy_tools": deployment_server},
        permission_mode="acceptEdits",
        allowed_tools=["Bash", "Write", "Read", "Edit", "Glob", "Grep", "Task",
        "mcp__deploy_tools__deploy_to_github"
        ],
        cwd="/home/user/app",
        model="claude-sonnet-4-6", # "claude-sonnet-4-5-20250929" "claude-opus-4-5-20251101"
    )

    # Session-Resume Unterstützung
    resume_session_id = os.getenv('RESUME_SESSION_ID')
    if resume_session_id:
        options.resume = resume_session_id
        print(f"[LILO] Resuming session: {resume_session_id}")

    # User Prompt - prefer file over env var (handles special chars better)
    user_prompt = None
    
    # First try reading from file (more reliable for special chars like umlauts)
    prompt_file = "/home/user/app/.user_prompt"
    if os.path.exists(prompt_file):
        try:
            with open(prompt_file, 'r') as f:
                user_prompt = f.read().strip()
            if user_prompt:
                print(f"[LILO] Prompt aus Datei gelesen: {len(user_prompt)} Zeichen")
        except Exception as e:
            print(f"[LILO] Fehler beim Lesen der Prompt-Datei: {e}")
    
    # Fallback to env var (for backwards compatibility)
    if not user_prompt:
        user_prompt = os.getenv('USER_PROMPT')
        if user_prompt:
            print(f"[LILO] Prompt aus ENV gelesen")
    
    if user_prompt:
        # Continue/Resume-Mode: Custom prompt vom User
        query = f"""🚨 AUFGABE: Du MUSST das existierende Dashboard ändern und deployen!

User-Anfrage: "{user_prompt}"

PFLICHT-SCHRITTE (alle müssen ausgeführt werden):

1. LESEN: Lies src/pages/Dashboard.tsx um die aktuelle Struktur zu verstehen
2. ÄNDERN: Implementiere die User-Anfrage mit dem Edit-Tool
3. TESTEN: Führe 'npm run build' aus um sicherzustellen dass es kompiliert
4. DEPLOYEN: Rufe deploy_to_github auf um die Änderungen zu pushen

⚠️ KRITISCH:
- Du MUSST Änderungen am Code machen (Edit-Tool verwenden!)
- Du MUSST am Ende deploy_to_github aufrufen!
- Beende NICHT ohne zu deployen!
- Analysieren alleine reicht NICHT - du musst HANDELN!

Das Dashboard existiert bereits. Mache NUR die angeforderten Änderungen, nicht mehr.
Starte JETZT mit Schritt 1!"""
        print(f"[LILO] Continue-Mode mit User-Prompt: {user_prompt}")
    else:
        # Normal-Mode: Neues Dashboard bauen
        query = (
            "Read .scaffold_context and app_metadata.json. "
            "Analyze data, decide UI paradigm in 1-2 sentences, then implement directly. "
            "Follow .claude/skills/frontend-impl/SKILL.md. "
            "Use existing types and services from src/types/ and src/services/. "
            "Deploy when done using the deploy_to_github tool."
        )
        print(f"[LILO] Build-Mode: Neues Dashboard erstellen")

    import time
    t_agent_total_start = time.time()
    print(f"[LILO] Initialisiere Client")

    # 4. Der Client Lifecycle
    async with ClaudeSDKClient(options=options) as client:

        # Anfrage senden
        await client.query(query)

        # 5. Antwort-Schleife
        # receive_response() liefert alles bis zum Ende des Auftrags
        t_last_step = t_agent_total_start
        
        async for message in client.receive_response():
            now = time.time()
            elapsed = round(now - t_agent_total_start, 1)
            dt = round(now - t_last_step, 1)
            t_last_step = now
            
            # A. Wenn er denkt oder spricht
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        print(json.dumps({"type": "think", "content": block.text, "t": elapsed, "dt": dt}), flush=True)
                    
                    elif isinstance(block, ToolUseBlock):
                        print(json.dumps({"type": "tool", "tool": block.name, "input": str(block.input), "t": elapsed, "dt": dt}), flush=True)

            # B. Wenn er fertig ist (oder Fehler)
            elif isinstance(message, ResultMessage):
                status = "success" if not message.is_error else "error"
                print(f"[LILO] Session ID: {message.session_id}")
                
                # Save session_id to file for future resume (AFTER ResultMessage)
                if message.session_id:
                    try:
                        with open("/home/user/app/.claude_session_id", "w") as f:
                            f.write(message.session_id)
                        print(f"[LILO] ✅ Session ID in Datei gespeichert")
                    except Exception as e:
                        print(f"[LILO] ⚠️ Fehler beim Speichern der Session ID: {e}")
                
                t_agent_total = time.time() - t_agent_total_start
                print(json.dumps({
                    "type": "result", 
                    "status": status, 
                    "cost": message.total_cost_usd,
                    "session_id": message.session_id,
                    "duration_s": round(t_agent_total, 1)
                }), flush=True)

if __name__ == "__main__":
    asyncio.run(main())