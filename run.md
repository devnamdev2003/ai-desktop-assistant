to run app:
```
npx tauri dev
```

to buils exe file:
```
npx tauri build
```

get signature for latest.json:
```
Get-Content .\src-tauri\target\release\bundle\nsis\Aivora_0.1.0_x64-setup.exe.sig
```

regenrate the sign:
```
Get-Content .\src-tauri\target\release\bundle\nsis\Aivora_0.1.0_x64-setup.exe.sig
```

change the latest.json file

db setup:
url=postgresql://<username>:<password>@<host>:<port>/<database_name>

run python manage.py