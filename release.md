Yes. Save this as your **Aivora release checklist**. The next time you change the app, you can follow the same flow.

## 🚀 Aivora — How to release a new version

### 1. Make your code changes

Work normally:

```powershell
# Angular/Tauri/Python changes
```

Test locally:

```powershell
npx tauri dev
```

Make sure the application works.

---

### 2. Increase the version

Suppose your current version is:

```text
0.1.0
```

For your next release, change it to:

```text
0.1.1
```

In:

```text
src-tauri/tauri.conf.json
```

change:

```json
"version": "0.1.0"
```

to:

```json
"version": "0.1.1"
```

**Important:** Your GitHub release tag must also become:

```text
v0.1.1
```

---

### 3. Make sure your signing environment is available

In the PowerShell session:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY="$HOME\.tauri\aivora.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="YOUR_PASSWORD"
```

Your private key stays on your PC. **Never upload `aivora.key` to GitHub.**

---

### 4. Build the new installer

From the project root:

```powershell
npx tauri build
```

This creates:

```text
src-tauri\target\release\bundle\nsis\
```

with:

```text
Aivora_0.1.1_x64-setup.exe
Aivora_0.1.1_x64-setup.exe.sig
```

---

if you got any error like this:

```text
A public key has been found, but no private key.
Error ... TAURI_SIGNING_PRIVATE_KEY
```

**the build is not fully successful yet**.

The important part is:

```text
Finished 2 bundles at:
Aivora_0.1.1_x64-setup.exe
```

but immediately afterward:

```text
A public key has been found, but no private key.
Error ... TAURI_SIGNING_PRIVATE_KEY
```

So:

* ✅ Aivora `0.1.1` compiled
* ✅ `.exe` installer was created
* ❌ Updater signature was **not** generated
* ❌ Don't upload this `0.1.1` installer to GitHub yet

### Why this happened

Your current PowerShell session doesn't have:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY
```

set anymore — likely because you opened a new terminal.

### Next step

Run:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY="$HOME\.tauri\aivora.key"
```

and also set your password:
```
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="YOUR_ACTUAL_PASSWORD"
```

Then verify **without revealing your password**:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

The first should show:

```text
C:\Users\devna\.tauri\aivora.key
```

and the second should show your password.

Then run:

```powershell
npx tauri build
```

This time you should get:

```text
Finished 2 updater signatures at:
...\Aivora_0.1.1_x64-setup.exe.sig
```

**Don't upload anything to GitHub until we see that signature successfully generated.**


### 5. Test the new installer yourself

Install:

```text
Aivora_0.1.1_x64-setup.exe
```

on your own PC.

Make sure Aivora launches correctly.

**Always do this before releasing.**

---

### 6. Get the new signature

Run:

```powershell
Get-Content .\src-tauri\target\release\bundle\nsis\Aivora_0.1.1_x64-setup.exe.sig
```

Copy the entire output.

---

### 7. Update `latest.json`

Change:

```json
"version": "0.1.0"
```

to:

```json
"version": "0.1.1"
```

Change the URL:

```json
"url": "https://github.com/devnamdev2003/ai-desktop-assistant/releases/download/v0.1.1/Aivora_0.1.1_x64-setup.exe"
```

And replace `"signature"` with the **new `.sig` contents**.

So conceptually:

```json
{
  "version": "0.1.1",
  "notes": "Your changes here",
  "pub_date": "2026-09-20T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "NEW_SIGNATURE_HERE",
      "url": "https://github.com/devnamdev2003/ai-desktop-assistant/releases/download/v0.1.1/Aivora_0.1.1_x64-setup.exe"
    }
  }
}
```

---

### 8. Verify `latest.json`

```powershell
Get-Content .\latest.json -Raw | ConvertFrom-Json
```

If PowerShell parses it without an error, you're good.

---

### 9. Create the GitHub Release

Go to your GitHub repository → **Releases → New release**.

Use:

```text
Tag: v0.1.1
Target: main
Title: Aivora v0.1.1
```

Upload exactly:

```text
Aivora_0.1.1_x64-setup.exe
Aivora_0.1.1_x64-setup.exe.sig
latest.json
```

Then publish the release.

---

### 10. Verify GitHub is serving the manifest

Run:

```powershell
Invoke-WebRequest "https://github.com/devnamdev2003/ai-desktop-assistant/releases/download/v0.1.1/latest.json" -UseBasicParsing
```

You want:

```text
StatusCode : 200
```

---

## 🔄 What happens to your friend?

Your friend already has:

```text
Aivora v0.1.0
```

You release:

```text
v0.1.1
```

Then:

```text
You
 ↓
Change code
 ↓
Version 0.1.0 → 0.1.1
 ↓
npx tauri build
 ↓
Signed .exe
 ↓
GitHub Release v0.1.1
 ↓
latest.json
 ↓
Friend opens Aivora
 ↓
Aivora checks GitHub
 ↓
Finds v0.1.1
 ↓
Downloads + verifies
 ↓
Installs
 ↓
Restarts
 ↓
Friend has v0.1.1
```

### 🧠 The short version to remember

```text
CHANGE
  ↓
VERSION
  ↓
BUILD
  ↓
TEST
  ↓
GET .SIG
  ↓
UPDATE latest.json
  ↓
GITHUB RELEASE
  ↓
UPLOAD .EXE + .SIG + latest.json
  ↓
PUBLISH
```

**One major improvement we'll want later:** automate steps 3–10 with **GitHub Actions**, so eventually your release process can be as simple as:

```text
git push
   ↓
GitHub Actions
   ↓
Build + sign
   ↓
Create release
   ↓
Friend automatically gets update
```

That is the production-grade workflow I'd recommend for Aivora.



You change only some text:
```
"What can I help with dev?"
        ↓
"What can I help you with today?"
```
Then your release process is:
```
1. Change the text
        ↓
2. Increase version
   0.1.1 → 0.1.2
        ↓
3. Build
   npx tauri build
        ↓
4. New .exe + .sig generated
        ↓
5. Update latest.json
        ↓
6. Create GitHub Release v0.1.2
        ↓
7. Upload:
   .exe
   .sig
   latest.json
        ↓
8. Publish
```
