
# MatrixKB for Scripting KM  - (React & Electron) – v2.5

- Visually Manage PATROL KM for Scripting config Files → Device → Scripts
- Support Generic scripts and Restmon Scripts Management
- Dryrun scripts to see the expected output
- CRUD: Create/Delete Devices & Scripts; Update scripts via Wizard
- Device Form (right-hand drawer) edits all device fields with defaults (Port=5985, Timeout=2000 ms, Poll=60 sec)
- Administration - Control Cetral Config like - default script path, default script type, number of generation to maintain as copy (backup) etc
- Command-only encoding: inside command `|`→`<BMC_SEP>`, `*`→`<BMC_STAR>`

# User Interface 
    - Web Interface (React)
    - Desktop Interface (Electron)
        - Allowing Dry Run of Scripts 
        - Allowinf Save configuration files to original location and backup rotation 

# Management of Configuration File & Configuration Data 
- Load file option to load a script file
- Save file with selected number of generations (backup rotation)
- "Save as" and "Export as" buttons 
- Playgorund for playing with config without loading a file 
- Configuraiton Preview shows the config created by the user

# Application Config.json
- config.json file allows user to manage the app design without need to change the code. This includes adding / deleting fields, reordering fileds in app and in the file etc. 
    - Restmon and Generic Script - Fields types and order of fields for generic and restmon scripts as they will be presented in the app/ web.
    - Adding / Deleting of new fields in the future.
    - Editing the script structure (delimiter, terminator, etc) as it will be written to the config file 

# Restmon Script 
- Handling for encryption of password field.

# Dry Run 
- Dry run option to see the expected output of the script 
- Copy to clipboard option to copy the script to clipboard  as well as the output 
- Copy to clipboard of script command that is executable from cmd window (different structure than the config file)


## Run (Dev)
```
npm install
npm run dev
```

## Run (Directly in Electron Mode)
```
npm run electron-dev
```

## Build (Prod)
```
npm run build
```