# Prompter

A teleprompter for recording videos on an Android phone. Load a script and it
shows in the third of the screen nearest the front camera, so you're looking
close to the lens while you read. The text scrolls while you talk and stops
when you pause.

## Using it

1. Open the app in **Chrome on Android** and allow the camera and microphone.
2. Tap **+ New script**, then paste your script or load a `.txt` file.
3. Tap **Record**. In ⚙ Settings, choose:
   - **Vertical 9:16** for Reels/Shorts (hold the phone upright), or
   - **Horizontal 16:9** for YouTube (turn the phone sideways; the text moves
     to the side the camera is on).
4. Tap ▶ to practice without recording, or the red button to record. You get a
   3-2-1 countdown first. Stay quiet during it so the app can learn how loud the room is.
5. When you stop, preview the take, then **Save / Share** (Android share
   menu → Photos, Instagram, YouTube, Drive…) or **Download**.

While reading:
- **Tap** the text to pause or resume.
- **Drag** the text to go back or skip ahead.
- ⤒ jumps back to the top.
- A Bluetooth page-turner or keyboard works too: Space or Enter pauses, and the
  arrow keys or Page Up/Down move the text.

### Settings
| Setting | What it does |
|---|---|
| Scrolling | *Follow my voice* scrolls only while you're talking. *Steady* scrolls at a constant speed. |
| Speed | Words per minute while you're talking. 130–160 is typical. |
| Text size | Bigger is easier to read from arm's length. |
| Mic sensitivity | Raise it if it doesn't start when you talk. Lower it if background noise keeps it moving. The white tick on the mic meter shows the trigger level. |
| Pause after silence | How long you need to be quiet before the text stops. |
| Text position | *Near camera* picks automatically, or you can force top, left, or right. |

## Privacy
Nothing leaves the phone. Scripts and settings are stored in the browser on
the device. Recordings exist only until you save, share, or discard them.

## How it works
- Plain HTML, CSS and JavaScript with no build step and no dependencies.
- Camera and mic: `getUserMedia` (front camera, 1080×1920 or 1920×1080).
- Recording: `MediaRecorder`, which saves MP4 on current Chrome and falls back to WebM.
- Pause detection: Web Audio measures mic loudness against a continuously
  updated estimate of the room's background noise. No speech recognition,
  so it works offline and in any language.
- Installable as a home-screen app (`manifest.webmanifest`) and works
  offline after the first visit (`sw.js`).

## Hosting
Camera access requires HTTPS, so it needs to be served from a real host. Any
static host works. For Cloudflare Pages: create a Pages project from this repo
with no build command and the output directory set to `/`.

When you change files, bump `CACHE` in `sw.js` so phones pick up the new version.

To test locally: `python3 -m http.server 8000` and open http://localhost:8000
(localhost counts as secure).
