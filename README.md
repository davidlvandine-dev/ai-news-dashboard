# AI News Dashboard

Daily local archive and dashboard for AI company news.

## What is tracked

The daily automation tracks these companies:

- NVIDIA
- Alphabet / Google DeepMind
- Microsoft
- OpenAI
- Anthropic
- Meta
- Amazon / AWS
- xAI
- Broadcom
- Palantir

Each snapshot is saved as `data/snapshots/YYYY-MM-DD.json` and listed in `data/index.json`.

The dashboard also tracks IPO status for AI companies that are public-market candidates or recent AI IPO benchmarks, plus major AI partnerships and contracts.

## Run The Dashboard

From this folder:

```powershell
.\start-dashboard.ps1
```

Then open:

```text
http://localhost:8765
```

You can also use the menu script:

```powershell
.\ai-news-dashboard-menu.ps1
```

The menu can start, stop, and show status for the dashboard process on port `8765`.

## Manual Update

The menu can also run a manual snapshot update:

```powershell
.\ai-news-dashboard-menu.ps1
```

Choose `4. Manual update now`.

Or run it directly:

```powershell
.\ai-news-dashboard-menu.ps1 -Action update
```

Manual updates use `generate-snapshot.py`, which requires the `anthropic` Python package and an `ANTHROPIC_API_KEY` environment variable.

## Raspberry Pi Setup

Copy this folder to the Pi, for example:

```powershell
scp -r C:\Users\dvand\OneDrive\Desktop\aiSync\codex\discovery\ai-news-dashboard dave@homedash.local:/home/dave/
```

Or use the included deploy helper:

```powershell
.\deploy-to-pi.ps1
```

The default deploys to:

```text
dave@homedash.local:/home/dave/ai-news-dashboard
```

On the Pi:

```bash
cd /home/dave/ai-news-dashboard
chmod +x pi-dashboard.sh update-with-codex.sh install-pi-cron.sh
./pi-dashboard.sh start
```

Open the dashboard from another computer on your network:

```text
http://<pi-ip-address>:8765
```

The Pi script binds the dashboard to `0.0.0.0`, which makes it reachable on your local network. If you only want it reachable from the Pi itself, run it with:

```bash
AI_NEWS_HOST=127.0.0.1 ./pi-dashboard.sh start
```

### Pi Cron Updates

Install Codex CLI on the Pi, then authenticate with ChatGPT:

```bash
codex login --device-auth
```

After Codex is logged in and the dashboard folder is on the Pi, install the cron schedule:

```bash
cd /home/dave/ai-news-dashboard
./install-pi-cron.sh
```

That installs:

```cron
0 8,12,18 * * * cd /home/dave/ai-news-dashboard && ./update-with-codex.sh >> /home/dave/ai-news-dashboard/logs/cron.log 2>&1
```

Manual Pi update:

```bash
./update-with-codex.sh
```

Quick Codex CLI test on the Pi:

```bash
codex exec --sandbox workspace-write "Say ready"
```

### Optional Systemd Service

To start the dashboard automatically after Pi reboots:

```bash
sudo cp ai-news-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ai-news-dashboard
sudo systemctl status ai-news-dashboard
```

If you place the folder somewhere other than `/home/dave/ai-news-dashboard`, edit `ai-news-dashboard.service` first and update `WorkingDirectory`.

## Data Contract

Each daily snapshot contains:

- `date`: snapshot date in `YYYY-MM-DD`
- `generatedAt`: ISO timestamp
- `companies`: array of company entries
- `ipoTracker`: array of IPO tracker entries
- `partnershipTracker`: array of partnership and contract tracker entries
- `sources`: flat source list used by the snapshot

Company entries contain:

- `name`
- `category`
- `summary`
- `items`: 3 to 5 news bullets with `headline`, `detail`, `sourceTitle`, `sourceUrl`, and optional `publishedDate`

IPO tracker entries contain:

- `company`
- `stage`
- `status`
- `process`
- `lastChecked`
- `confidence`
- `note`
- `latestArticle`: object with `title`, `source`, `url`, and optional `publishedDate`

Partnership tracker entries contain:

- `relationship`
- `companies`
- `type`
- `status`
- `terms`
- `lastChecked`
- `confidence`
- `note`
- `latestArticle`: object with `title`, `source`, `url`, and optional `publishedDate`
