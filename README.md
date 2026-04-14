
# Matrix RestMon SuperSonic - Scripting Automator – v2.5
A solution that transforms PATROL KM configuration management into a seamless visual experience. Instead of manually editing text files, administrators can visually manage complex hierarchies of devices and scripts—including generic and Restmon payloads. With built-in safeguards like script dry-runs, automatic character encoding, and a centralized administration center for managing backups and defaults, it dramatically reduces configuration errors and deployment time.

# Key Features 
- Visual Config Manager: UI for mapping PATROL KM files across the Device → Scripts hierarchy.
- Script Wizard & CRUD: Native support for managing and editing Generic and Restmon scripts.
- Dry-run Validation: Embedded payload testing to view expected script output safely.
- Quick-Edit Device Drawer: Slide-out form with predefined best-practice defaults (Port=5985, Timeout=2000ms, Poll=60s).
- Admin Control Center: Global configuration management for script paths, types, and backup retention rules.
- Safe Command Parsing: Embedded encoding engine translates | to <BMC_SEP> and * to <BMC_STAR>.
- Copy and Paste Script Definitions and Entire device with all its script 
- Drag & Drop Scripts and Devices to re-order them in the list 

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