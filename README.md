
# Scripting KM for RestMon Manager (FBCSKM) - (React) – v2.4

- Parse long FBCSKM lines → Device → Scripts
- CRUD: Create/Delete Devices & Scripts; Update scripts via Wizard
- Device Form (right-hand drawer) edits all device fields with defaults (Port=5985, Timeout=2000 ms, Poll=60 sec)
- Command-only encoding: inside command `|`→`<BMC_SEP>`, `*`→`<BMC_STAR>`
- Save in place with 30-generation backup rotation; Export as...

## Run (Dev)
```
npm install
npm run dev
```

## Build (Prod)
```
npm run build
```

## FBCSKM device fields order
```
Device Name/IP, Forced IP Address, Port, Connection timeout (ms), Connection poll interval (sec),
Username, Password, Public Key Path, Private Key Path, Passphrase
```
