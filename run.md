update the tauri.conf.json, environment.ts file 

to run app:
```
npx tauri dev
```

$env:TAURI_SIGNING_PRIVATE_KEY="$HOME\.tauri\aivora.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="dev"
npx tauri build

```

get signature for latest.json:
```
Get-Content .\src-tauri\target\release\bundle\nsis\Aivora_0.1.0_x64-setup.exe.sig
```

change the latest.json file

db setup:
url=postgresql://<username>:<password>@<host>:<port>/<database_name>

run python manage.py